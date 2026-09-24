import React, { useMemo, useState, useEffect } from 'react';
import { ServiceOrder, OrderStatus, User, Customer, OrderPriority } from '../../types';
import { useTenant } from '../../hooks/nexusHooks';
import {
  ClipboardList, CheckCircle, Clock, AlertCircle, TrendingUp, BarChart3,
  Briefcase, Activity, ShieldAlert, Timer, ArrowRight, Calendar, Zap, Layers, Target, Boxes, PieChart, BarChart,
  Search, Filter, UserCheck, Users, ChevronRight, Gauge, ZapOff, Settings, BellRing, X,
  RefreshCw, Loader2, Maximize2
} from 'lucide-react';

const HalfMoonGauge = ({ percentage, target, colorClass, gradientId, label, subLabel }: any) => {
  const radius = 60;
  const strokeWidth = 12;
  const cx = radius + strokeWidth;
  const cy = radius + strokeWidth;
  const r = radius;
  const circumference = Math.PI * r;
  const strokeDashoffset = circumference - (Math.min(percentage, 100) / 100) * circumference;
  
  // Calcular posição do marcador da meta
  const targetRad = Math.PI - (target / 100) * Math.PI;
  const targetX1 = cx + r * Math.cos(targetRad);
  const targetY1 = cy - r * Math.sin(targetRad);
  const targetX2 = cx + (r + 8) * Math.cos(targetRad);
  const targetY2 = cy - (r + 8) * Math.sin(targetRad);

  return (
    <div className="relative flex flex-col items-center justify-center mb-1">
      <svg width={(radius + strokeWidth) * 2} height={radius + strokeWidth + 5} viewBox={`0 0 ${(radius + strokeWidth) * 2} ${radius + strokeWidth + 5}`} className="drop-shadow-lg overflow-visible">
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="currentColor" className="opacity-40" />
            <stop offset="100%" stopColor="currentColor" className="opacity-100" />
          </linearGradient>
          <filter id={`glow-${gradientId}`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>
        {/* Background Arc */}
        <path
          d={`M ${strokeWidth} ${cy} A ${r} ${r} 0 0 1 ${cx * 2 - strokeWidth} ${cy}`}
          fill="none"
          stroke="rgba(255,255,255,0.15)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        {/* Progress Arc */}
        <path
          d={`M ${strokeWidth} ${cy} A ${r} ${r} 0 0 1 ${cx * 2 - strokeWidth} ${cy}`}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className={`transition-all duration-1000 ease-out ${colorClass}`}
          filter={`url(#glow-${gradientId})`}
        />
        {/* Target Marker */}
        <line
          x1={targetX1} y1={targetY1} x2={targetX2} y2={targetY2}
          stroke="#fff" strokeWidth="2.5" strokeLinecap="round" className="drop-shadow-md"
        />
        {/* Target Text */}
        <text
          x={cx + (r + 16) * Math.cos(targetRad)}
          y={cy - (r + 16) * Math.sin(targetRad)}
          fill="#fff" fontSize="8" fontWeight="bold" textAnchor="middle" alignmentBaseline="middle"
          className="drop-shadow-md opacity-80"
        >
          {target}%
        </text>
      </svg>
      <div className="absolute bottom-[0px] flex flex-col items-center">
        <span className="text-[32px] font-black tracking-tighter drop-shadow-md leading-none text-white">{percentage}%</span>
        <span className="text-[9px] font-bold text-white/80 uppercase tracking-widest mt-1">{label}</span>
      </div>
    </div>
  );
};

const DonutChart = ({ data, colors, size = 160, strokeWidth = 20, innerLabel, innerValue }: any) => {
  const center = size / 2;
  const radius = center - strokeWidth / 2;
  const circumference = 2 * Math.PI * radius;
  let accumulatedPercent = 0;

  return (
    <div className="relative flex items-center justify-center group" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90 drop-shadow-lg overflow-visible">
        {/* Background Circle */}
        <circle cx={center} cy={center} r={radius} fill="none" stroke="#f1f5f9" strokeWidth={strokeWidth} />
        {data.map((item: any, i: number) => {
          if (!item.percentage) return null;
          const percent = item.percentage / 100;
          const strokeDasharray = `${percent * circumference} ${circumference}`;
          const strokeDashoffset = -(accumulatedPercent * circumference);
          accumulatedPercent += percent;
          const isFull = percent > 0.99;
          return (
            <circle
              key={i}
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke={colors ? (colors[item.status] || '#cbd5e1') : item.color}
              strokeWidth={strokeWidth}
              strokeDasharray={strokeDasharray}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap={isFull ? "butt" : "round"}
              className="transition-all duration-1000 ease-out hover:strokeWidth-[24px] cursor-pointer origin-center hover:scale-105"
            />
          );
        })}
      </svg>
      <div className="absolute flex flex-col items-center justify-center pointer-events-none transition-transform group-hover:scale-110">
        <span className="text-3xl font-black text-slate-800 tracking-tighter drop-shadow-sm">{innerValue}</span>
        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{innerLabel}</span>
      </div>
    </div>
  );
};

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
  const { data: tenantData } = useTenant();
  const slaTarget = tenantData?.metadata?.slaTargetPercentage ?? 85;
  const sla48Target = tenantData?.metadata?.sla48hTargetPercentage ?? 90;

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
    const validScheduledOrders = filteredOrders.filter(o => {
      const s = (o.status || '').toUpperCase();
      return s !== 'CANCELADO' && s !== 'CANCELED';
    });
    const totalScheduledContext = validScheduledOrders.length;

    const completed = validScheduledOrders.filter(o => o.status === OrderStatus.COMPLETED && o.createdAt && o.endDate);

    let within24 = 0;
    let within36 = 0;
    let within48 = 0;
    let between24and48 = 0;

    completed.forEach(o => {
      if (!o.createdAt || !o.endDate) return;
      try {
        const created = new Date(o.createdAt).getTime();
        const closed = new Date(o.endDate).getTime();
        const diffHours = (closed - created) / (1000 * 60 * 60);

        if (diffHours <= 24) { within24++; within36++; within48++; }
        else if (diffHours <= 36) { within36++; within48++; between24and48++; }
        else if (diffHours <= 48) { within48++; between24and48++; }
      } catch (e) {
        console.warn("Nexus Analytics: Erro ao calcular diffHours", e);
      }
    });

    const slaEfficiency24 = totalScheduledContext > 0 ? Math.round((within24 / totalScheduledContext) * 100) : 0;
    const slaEfficiency48 = totalScheduledContext > 0 ? Math.round((within48 / totalScheduledContext) * 100) : 0;
    const between24and48Pct = totalScheduledContext > 0 ? Math.round((between24and48 / totalScheduledContext) * 100) : 0;

    // ATRASOS ATUAIS (Real-time de fila de atendimento)
    let currentOver24 = 0;
    let currentOver48 = 0;
    const nowMs = new Date().getTime();
    
    // Filtra estritamente OSs que estão na fila ativa e que definitivamente não são canceladas ou concluídas
    const openOrders = validScheduledOrders.filter(o => {
      const s = (o.status || '').toUpperCase();
      return ['PENDENTE', 'ATRIBUÍDO', 'EM ANDAMENTO', 'IMPEDIDO'].includes(s) && s !== 'CANCELADO' && s !== 'CONCLUÍDO';
    });
    
    openOrders.forEach(o => {
        if (!o.createdAt) return;
        const created = new Date(o.createdAt).getTime();
        const diffHours = (nowMs - created) / (1000 * 60 * 60);
        
        // Se já passou das 48h
        if (diffHours >= 48) {
            currentOver48++;
            currentOver24++;
        } else if (diffHours >= 24) { // Entre 24h e 48h
            currentOver24++;
        }
    });

    const over24Percentage = openOrders.length > 0 ? Math.round((currentOver24 / openOrders.length) * 100) : 0;
    const over48Percentage = openOrders.length > 0 ? Math.round((currentOver48 / openOrders.length) * 100) : 0;

    return { 
      within24, within36, within48, between24and48, between24and48Pct, 
      over24: currentOver24, over48: currentOver48, over24Percentage, over48Percentage, 
      slaEfficiency24, slaEfficiency48, totalCompleted: completed.length 
    };
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
    const counts = { urgent: 0, critical: 0, planned: 0, activeMonitors: 0 };
    const visits = activeContracts.map(c => {
      const day = Number(c.maintenanceDay) || 1;
      let daysUntil = day >= todayNum ? day - todayNum : (daysInMonth - todayNum) + day;
      
      const alertsEnabled = c.alertSettings?.enabled !== false;
      const alertDays = c.alertSettings?.daysBefore || 5;

      if (alertsEnabled) {
          counts.activeMonitors++;
      }

      if (daysUntil <= alertDays && alertsEnabled) counts.urgent++;
      else if (daysUntil <= 7) counts.critical++;
      else counts.planned++;
      return { ...c, daysUntil, isTriggered: daysUntil <= alertDays && alertsEnabled };
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

      {/* Search & Filter Toolbar */}
      <div className="mb-2 sm:mb-4 p-2 sm:p-3 rounded-2xl border border-[#1c2d4f]/20 bg-white/40 shadow-sm backdrop-blur-md flex flex-col gap-3">
        {/* Top Row: Title, Search, Fast Filters, Toggle */}
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 sm:gap-4">
          
          {/* Left Side: Title */}
          <div className="shrink-0">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight lowercase">visão geral</h1>
            <p className="text-xs sm:text-sm text-slate-500 font-medium mt-1">Monitore o desempenho operacional e SLAs em tempo real</p>
          </div>

          <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center justify-end gap-2 sm:gap-3 w-full lg:w-auto flex-1">
            {/* Search */}
            <div className="relative flex-1 sm:flex-none sm:min-w-[240px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                placeholder="Pesquisar cliente, OS..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full h-10 bg-white border border-[#1c2d4f]/20 rounded-xl pl-9 pr-4 text-xs font-bold text-slate-700 placeholder-slate-400 outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all shadow-sm"
              />
            </div>

            {/* Fast Filters Group */}
            <div className="flex items-center gap-1 bg-white border border-[#1c2d4f]/10 p-1 rounded-xl shadow-sm overflow-x-auto custom-scrollbar shrink-0">
              {['today', 'week', 'month'].map((type) => (
                <button
                  key={type}
                  onClick={() => handleFastFilter(type as any)}
                  className="h-8 px-3 text-[10px] font-bold uppercase text-slate-500 hover:text-[#1c2d4f] rounded-lg hover:bg-slate-50 transition-all whitespace-nowrap"
                >
                  {type === 'today' ? 'Hoje' : type === 'week' ? '7 Dias' : '30 Dias'}
                </button>
              ))}
            </div>

            {/* Actions Group */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center gap-1.5 px-3 h-10 rounded-xl border transition-all text-[10px] font-bold ${showFilters ? 'bg-primary-50 border-primary-200 text-primary-600 shadow-inner' : 'bg-white border-[#1c2d4f]/20 text-[#1c2d4f] hover:bg-[#1c2d4f]/5 shadow-sm'}`}
              >
                <Filter size={14} /> <span className="hidden sm:inline">{showFilters ? 'Ocultar' : 'Filtros'}</span>
              </button>
              
              <button
                onClick={() => window.location.reload()}
                className="group h-10 px-3 flex items-center justify-center bg-white hover:bg-slate-50 border border-[#1c2d4f]/20 rounded-xl text-[#1c2d4f] hover:text-primary-600 shadow-sm transition-all active:scale-95"
                title="Atualizar dados"
              >
                <RefreshCw size={16} className="group-hover:rotate-180 transition-transform duration-500" />
              </button>

              <button
                onClick={() => {
                  setSearchTerm(''); setStatusFilter('ALL'); setTechFilter('ALL'); setCustomerFilter('ALL'); setDateTypeFilter('scheduled');
                  const end = new Date();
                  const start = new Date();
                  start.setDate(start.getDate() - 30);
                  onDateChange(start.toISOString().split('T')[0], end.toISOString().split('T')[0]);
                }}
                className="flex items-center gap-1.5 px-3 h-10 rounded-xl border border-rose-200 text-rose-500 hover:bg-rose-50 hover:text-rose-600 shadow-sm transition-all text-[10px] font-bold bg-white"
                title="Limpar Filtros e Restaurar Padrão (30 Dias)"
              >
                <X size={14} /> <span className="hidden sm:inline">Limpar</span>
              </button>
            </div>
          </div>
        </div>

        {/* Collapsible Filters Row */}
        {showFilters && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 p-3 bg-white/60 rounded-xl border border-[#1c2d4f]/10 animate-in fade-in slide-in-from-top-2 duration-200 mt-1">
            <div className="flex flex-col gap-1 lg:col-span-2">
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider px-1">Período de Análise</label>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-1.5 bg-white border border-[#1c2d4f]/20 p-1.5 rounded-lg shadow-sm sm:h-9">
                <select
                  value={dateTypeFilter}
                  onChange={(e) => setDateTypeFilter(e.target.value as 'scheduled' | 'created' | 'completed')}
                  className="bg-slate-50 text-[10px] font-bold text-[#1c2d4f] px-2 py-1 rounded border border-[#1c2d4f]/10 outline-none cursor-pointer w-full sm:w-24 shrink-0"
                >
                  <option value="scheduled">Agenda</option>
                  <option value="created">Abertura</option>
                  <option value="completed">Conclusão</option>
                </select>
                <div className="hidden sm:block w-px h-4 bg-[#1c2d4f]/10 mx-1" />
                <div className="flex items-center gap-1 px-1 flex-1 min-w-0 justify-between">
                  <input type="date" value={startDate} onChange={e => onDateChange(e.target.value, endDate)} className="bg-transparent text-xs font-bold text-slate-700 outline-none flex-1 min-w-0 max-w-full w-full px-1" />
                  <span className="text-[9px] font-bold text-slate-300 shrink-0">ATÉ</span>
                  <input type="date" value={endDate} onChange={e => onDateChange(startDate, e.target.value)} className="bg-transparent text-xs font-bold text-slate-700 outline-none flex-1 min-w-0 max-w-full w-full px-1" />
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider px-1">Técnico / Responsável</label>
              <div className="flex items-center bg-white border border-[#1c2d4f]/20 rounded-lg px-2 shadow-sm h-9">
                <UserCheck size={12} className="text-slate-400 mr-1.5 shrink-0" />
                <select className="bg-transparent text-[10px] font-bold text-slate-700 outline-none w-full cursor-pointer h-full" value={techFilter} onChange={e => setTechFilter(e.target.value)}>
                  <option value="ALL">Todos Técnicos</option>
                  {techs.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                </select>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider px-1">Carteira de Clientes</label>
              <div className="flex items-center bg-white border border-[#1c2d4f]/20 rounded-lg px-2 shadow-sm h-9">
                <Users size={12} className="text-slate-400 mr-1.5 shrink-0" />
                <select className="bg-transparent text-[10px] font-bold text-slate-700 outline-none w-full cursor-pointer h-full" value={customerFilter} onChange={e => setCustomerFilter(e.target.value)}>
                  <option value="ALL">Todos Clientes</option>
                  {customers.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* KPI GRID - DESEMPENHO SLA */}
      <div className="mb-4">
         <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-3">Desempenho de SLA</h3>
         <div className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-5">

        {/* KPI: SLA 24H (Vibrant Gradient) */}
        <div className="bg-gradient-to-br from-indigo-600 via-[#2e3e6b] to-[#1c2d4f] rounded-3xl p-5 shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-indigo-400/20 flex flex-col justify-between text-white relative overflow-hidden group">
          <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/10 rounded-full blur-3xl transition-all duration-700 group-hover:bg-white/20" />
          <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-indigo-400/20 rounded-full blur-3xl" />
          
          <div className="flex justify-between items-start relative z-10 w-full mb-1">
            <div>
              <p className="text-[10px] font-black text-indigo-100 uppercase tracking-widest drop-shadow-sm">SLA 24 Horas</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] font-bold text-indigo-200/80 bg-black/20 px-2 py-0.5 rounded-full backdrop-blur-md border border-white/10">{closureKPIs.within24} OS Fechadas</span>
              </div>
            </div>
            <div className="p-2 bg-white/10 rounded-2xl text-indigo-100 backdrop-blur-md border border-white/20 shadow-inner group-hover:scale-110 group-hover:rotate-12 transition-transform"><Gauge size={18} /></div>
          </div>

          <div className="mt-3 relative z-10 flex justify-center py-1">
            <HalfMoonGauge 
              percentage={closureKPIs.slaEfficiency24} 
              target={slaTarget} 
              colorClass="text-emerald-400" 
              gradientId="grad24" 
              label="Eficiência" 
            />
          </div>

          <div className="mt-1 relative z-10 bg-black/10 rounded-xl p-2.5 backdrop-blur-sm border border-white/5 flex justify-between items-center">
             <span className="text-[9px] font-bold text-indigo-200 uppercase flex items-center gap-1"><Target size={10}/> Meta Acordada</span>
             <span className="text-[10px] font-black text-white">{slaTarget}%</span>
          </div>
        </div>

        {/* KPI: SLA 48H (Emerald Gradient) */}
        <div className="bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-800 rounded-3xl p-5 shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-emerald-400/20 flex flex-col justify-between text-white relative overflow-hidden group">
          <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/10 rounded-full blur-3xl transition-all duration-700 group-hover:bg-white/20" />
          <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-emerald-400/20 rounded-full blur-3xl" />
          
          <div className="flex justify-between items-start relative z-10 w-full mb-1">
            <div>
              <p className="text-[10px] font-black text-emerald-100 uppercase tracking-widest drop-shadow-sm">SLA 48 Horas</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] font-bold text-emerald-200/80 bg-black/20 px-2 py-0.5 rounded-full backdrop-blur-md border border-white/10">{closureKPIs.within48} OS Fechadas</span>
              </div>
            </div>
            <div className="p-2 bg-white/10 rounded-2xl text-emerald-100 backdrop-blur-md border border-white/20 shadow-inner group-hover:scale-110 group-hover:rotate-12 transition-transform"><CheckCircle size={18} /></div>
          </div>

          <div className="mt-3 relative z-10 flex justify-center py-1">
            <HalfMoonGauge 
              percentage={closureKPIs.slaEfficiency48} 
              target={sla48Target} 
              colorClass="text-emerald-200" 
              gradientId="grad48" 
              label="Acumulado" 
            />
          </div>

          <div className="mt-1 relative z-10 bg-black/10 rounded-xl p-2.5 backdrop-blur-sm border border-white/5 flex justify-between items-center">
             <span className="text-[9px] font-bold text-emerald-200 uppercase flex items-center gap-1"><Target size={10}/> Meta Global</span>
             <span className="text-[10px] font-black text-white">{sla48Target}%</span>
          </div>
        </div>

        {/* KPI: FORA DO PRAZO (Atrasos) */}
        <div className="bg-gradient-to-br from-red-600 via-rose-700 to-rose-900 rounded-3xl p-5 shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-red-400/20 flex flex-col justify-between text-white relative overflow-hidden group">
          <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-white/10 rounded-full blur-3xl transition-all duration-700 group-hover:bg-white/20" />
          <div className="absolute -top-10 -right-10 w-32 h-32 bg-red-400/20 rounded-full blur-3xl" />
          
          <div className="flex justify-between items-start relative z-10 w-full mb-1">
            <div>
              <p className="text-[10px] font-black text-red-100 uppercase tracking-widest drop-shadow-sm">Atrasos (SLA Quebrado)</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] font-bold text-red-200/80 bg-black/20 px-2 py-0.5 rounded-full backdrop-blur-md border border-white/10">Atenção Imediata</span>
              </div>
            </div>
            <div className="p-2 bg-white/10 rounded-2xl text-red-100 backdrop-blur-md border border-white/20 shadow-inner group-hover:scale-110 group-hover:-rotate-12 transition-transform"><AlertCircle size={18} /></div>
          </div>

          <div className="mt-3 relative z-10 flex flex-col items-center py-2">
            <h2 className="text-[52px] font-black tracking-tighter drop-shadow-xl leading-none text-white">{closureKPIs.over24}</h2>
            <span className="text-[11px] font-bold text-red-200 mt-1 tracking-widest uppercase">OS Vencidas</span>
          </div>

          <div className="mt-auto relative z-10 grid grid-cols-2 gap-2">
            <div className="bg-black/20 backdrop-blur-md rounded-xl p-2.5 border border-white/10 flex flex-col items-center justify-center">
              <span className="text-[9px] font-bold text-red-200 mb-1 uppercase tracking-wider">&gt; 24h</span>
              <div className="flex items-baseline gap-1">
                <span className="text-lg font-black text-white">{closureKPIs.over24}</span>
                <span className="text-[9px] text-red-300 font-bold">({closureKPIs.over24Percentage}%)</span>
              </div>
            </div>
            <div className="bg-black/30 backdrop-blur-md rounded-xl p-2.5 border border-red-500/30 flex flex-col items-center justify-center">
              <span className="text-[9px] font-bold text-rose-300 mb-1 uppercase tracking-wider">&gt; 48h (Crítico)</span>
              <div className="flex items-baseline gap-1">
                <span className="text-lg font-black text-rose-100">{closureKPIs.over48}</span>
                <span className="text-[9px] text-rose-300 font-bold">({closureKPIs.over48Percentage}%)</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      </div>

      {/* KPI GRID - STATUS DA OPERAÇÃO */}
      <div className="mb-6">
         <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-3">Status da Operação</h3>
         <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6">

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

          <div className="flex items-end justify-between gap-2 sm:gap-4 md:gap-6 h-[180px] px-2 pt-6 border-b border-slate-200 relative z-10 mt-auto pb-0">
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
                      <span className="text-[11px] font-black text-slate-700 mb-2 opacity-0 group-hover:opacity-100 group-hover:-translate-y-1 transition-all drop-shadow-sm">{s.count}</span>
                    )}
                    <div
                      className="w-full max-w-[64px] rounded-t-xl shadow-sm transition-all duration-[800ms] ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:brightness-110 group-hover:shadow-[0_0_20px_rgba(0,0,0,0.15)] relative overflow-hidden"
                      style={{
                        height: hasData ? `${Math.max(heightPercentage, 4)}%` : '4px',
                        background: `linear-gradient(180deg, ${pieColors[s.status]} 0%, ${pieColors[s.status]}bb 100%)`,
                        boxShadow: hasData ? `0 -4px 15px ${pieColors[s.status]}40` : 'none',
                      }}
                    >
                      <div className="absolute inset-0 w-full h-full bg-[linear-gradient(180deg,rgba(255,255,255,0.4)_0%,transparent_100%)] pointer-events-none"></div>
                    </div>
                  </div>
                  <div className="flex flex-col items-center gap-1 text-center min-h-[44px] mt-4">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider leading-tight w-20 line-clamp-2 group-hover:text-slate-900 transition-colors">{s.status}</span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Legenda */}
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mt-6 relative z-10 w-full mx-auto">
            {statusData.map(s => (
              <div key={s.status} className="flex justify-between items-center p-3 rounded-2xl bg-white border border-slate-100 hover:border-slate-300 transition-all shadow-[0_2px_10px_rgb(0,0,0,0.02)] hover:shadow-[0_8px_20px_rgb(0,0,0,0.06)] group cursor-default">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full shadow-sm border border-black/5" style={{ backgroundColor: pieColors[s.status], boxShadow: `0 0 10px ${pieColors[s.status]}80` }} />
                  <span className="text-[10px] font-bold text-slate-500 truncate max-w-[60px]">{s.status}</span>
                </div>
                <p className="text-sm font-black text-slate-800 leading-none">{s.count}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* DONUT CHART: RESUMO DE QUALIDADE */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 flex flex-col justify-between items-center shadow-[0_8px_30px_rgb(0,0,0,0.04)] h-full hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-all">
          <div className="w-full text-center mb-4">
            <h4 className="text-[11px] font-black text-slate-400 tracking-[0.2em] uppercase">Resumo de Qualidade</h4>
          </div>
          
          <div className="flex-1 flex items-center justify-center py-4">
            <DonutChart 
              data={statusData} 
              colors={pieColors} 
              size={180} 
              strokeWidth={24}
              innerLabel="Resolvido"
              innerValue={`${statusData.find(s => s.status === OrderStatus.COMPLETED)?.percentage || 0}%`}
            />
          </div>

          <div className="mt-4 w-full bg-slate-50 rounded-2xl p-4 border border-slate-100">
            <div className="flex justify-between items-center mb-2">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Fechadas com Sucesso</span>
              <span className="text-lg font-black text-slate-800">{statusData.find(s => s.status === OrderStatus.COMPLETED)?.count || 0}</span>
            </div>
            <div className="w-full h-2 bg-slate-200/50 rounded-full overflow-hidden shadow-inner">
              <div 
                className="h-full bg-emerald-500 rounded-full shadow-[0_0_10px_rgba(16,185,129,0.5)]" 
                style={{ width: `${(statusData.find(s => s.status === OrderStatus.COMPLETED)?.percentage || 0)}%` }} 
              />
            </div>
          </div>
        </div>

        {/* DONUT CHART: TIPOS DE MODALIDADE */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 flex flex-col items-center shadow-[0_8px_30px_rgb(0,0,0,0.04)] h-full hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-all">
          <div className="w-full text-center mb-4">
            <h4 className="text-[11px] font-black text-slate-400 tracking-[0.2em] uppercase">Distribuição Operacional</h4>
          </div>
          
          <div className="flex-1 flex items-center justify-center py-4 shrink-0">
            <DonutChart 
              data={operationData} 
              colors={null} // Uses item.color
              size={180} 
              strokeWidth={24}
              innerLabel="Tipos"
              innerValue={operationData.length}
            />
          </div>

          <div className="mt-4 w-full max-h-[140px] overflow-y-auto custom-scrollbar pr-1 flex-1">
            {operationData.map(o => (
              <div key={o.type} className="flex justify-between items-center text-[11px] font-bold p-2.5 mb-1.5 border border-slate-100 bg-slate-50/50 rounded-xl hover:bg-slate-100 transition-colors cursor-default group/op">
                <div className="flex items-center gap-2.5">
                  <div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: o.color }} />
                  <span className="text-slate-600 group-hover/op:text-slate-900 truncate max-w-[120px]" title={o.type}>{o.type}</span>
                </div>
                <div className="text-right flex items-center gap-2">
                  <span className="text-sm font-black text-slate-800">{o.count}</span>
                  <span className="text-[9px] font-black text-slate-500 bg-white px-1.5 py-0.5 rounded shadow-sm border border-slate-200">{o.percentage}%</span>
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
                  <p className="text-[9px] text-[#60a5fa]/60 font-bold flex items-center gap-1 mt-0.5"><BellRing size={8} /> {pmocAnalysis.counts.activeMonitors} monitorados ativamente</p>
                </div>
              </div>
              <span className="px-2.5 py-1 bg-white/10 rounded-full text-[9px] font-bold border border-white/10">{activeContracts.length} Contrat.</span>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="p-3 bg-rose-500/10 rounded-lg border border-rose-500/20 group-hover:bg-rose-500/20 transition-colors">
                <p className="text-[8px] font-bold text-rose-400 mb-1 flex items-center gap-1"><AlertCircle size={10} /> Gatilho Ativado</p>
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
                  <span className="font-bold  truncate max-w-[140px] text-white/80 group-hover/item:text-white flex items-center gap-1.5">
                      {v.isTriggered && <div className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></div>}
                      {v.customerName}
                  </span>
                  <span className={`font-bold px-1.5 py-0.5 rounded text-[8px] ${v.isTriggered ? 'bg-rose-500/20 text-rose-300' : 'bg-primary-500/20 text-primary-300'}`}>D-{v.daysUntil}</span>
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
