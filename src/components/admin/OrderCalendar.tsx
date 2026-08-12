import React, { useState, useMemo } from 'react';
import {
  format,
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  isSameMonth,
  isSameDay,
  eachDayOfInterval,
  parseISO,
  addDays,
  isToday as isDateToday
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Search,
  User,
  ExternalLink,
  Clock,
  Box,
  X,
  MapPin,
  ChevronLeft,
  ChevronRight,
  Filter,
  Calendar as CalendarIcon,
  Layers,
  AlertCircle
} from 'lucide-react';
import { ServiceOrder, User as TechUser, Customer, OrderStatus } from '../../types';

interface OrderCalendarProps {
  orders: ServiceOrder[];
  techs: TechUser[];
  customers: Customer[];
}

const getStatusHexColor = (status: OrderStatus) => {
  switch (status) {
    case OrderStatus.PENDING:     return '#94a3b8'; // bg-slate-400
    case OrderStatus.ASSIGNED:    return '#7391b4'; // bg-primary-400
    case OrderStatus.TRAVELING:   return '#0ea5e9'; // bg-sky-500
    case OrderStatus.IN_PROGRESS: return '#6366f1'; // bg-indigo-500
    case OrderStatus.COMPLETED:   return '#10b981'; // bg-emerald-500
    case OrderStatus.CANCELED:    return '#f43f5e'; // bg-rose-500
    case OrderStatus.BLOCKED:     return '#f59e0b'; // bg-amber-500
    default:                      return '#94a3b8'; // bg-slate-400
  }
};

const STATUS_LABELS: Record<string, string> = {
  [OrderStatus.PENDING]:     'agendada',
  [OrderStatus.ASSIGNED]:    'atribuída',
  [OrderStatus.TRAVELING]:   'em deslocamento',
  [OrderStatus.IN_PROGRESS]: 'em andamento',
  [OrderStatus.COMPLETED]:   'concluída',
  [OrderStatus.CANCELED]:    'cancelada',
  [OrderStatus.BLOCKED]:     'bloqueada',
};

export const OrderCalendar: React.FC<OrderCalendarProps> = ({ orders, techs, customers }) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [searchTerm, setSearchTerm] = useState('');
  const [techFilter, setTechFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'ALL'>('ALL');
  const [selectedDayData, setSelectedDayData] = useState<{ day: Date; orders: ServiceOrder[] } | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<ServiceOrder | null>(null);

  const hasActiveFilters = searchTerm !== '' || techFilter !== 'ALL' || statusFilter !== 'ALL';

  // Filtro de Técnico Avançado (Dropdown Pesquisável)
  const [isTechDropdownOpen, setIsTechDropdownOpen] = useState(false);
  const [techSearchQuery, setTechSearchQuery] = useState('');
  const techDropdownRef = React.useRef<HTMLDivElement>(null);
  const monthDropdownRef = React.useRef<HTMLDivElement>(null);
  const [isMonthDropdownOpen, setIsMonthDropdownOpen] = useState(false);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (techDropdownRef.current && !techDropdownRef.current.contains(event.target as Node)) {
        setIsTechDropdownOpen(false);
      }
      if (monthDropdownRef.current && !monthDropdownRef.current.contains(event.target as Node)) {
        setIsMonthDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      const term = searchTerm.toLowerCase();
      const matchesSearch =
        (order.title || '').toLowerCase().includes(term) ||
        (order.customerName || '').toLowerCase().includes(term) ||
        (order.id || '').toLowerCase().includes(term) ||
        (order.displayId || '').toLowerCase().includes(term);
      const matchesStatus = statusFilter === 'ALL' || order.status === statusFilter;
      const matchesTech = techFilter === 'ALL' || order.assignedTo === techFilter;
      return matchesSearch && matchesStatus && matchesTech;
    });
  }, [orders, techs, searchTerm, statusFilter, techFilter]);

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 0 });
    let interval = eachDayOfInterval({ start, end });
    while (interval.length < 42) {
      interval.push(addDays(interval[interval.length - 1], 1));
    }
    return interval;
  }, [currentMonth]);

  const getOrdersForDay = (day: Date) =>
    filteredOrders
      .filter(o => o.scheduledDate && isSameDay(parseISO(o.scheduledDate.substring(0, 10)), day))
      .sort((a, b) => (a.scheduledTime || '') > (b.scheduledTime || '') ? 1 : -1);

  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
  const goToToday  = () => setCurrentMonth(new Date());

  // Total de OS no mês
  const monthTotal = useMemo(() => {
    const start = startOfMonth(currentMonth);
    const end   = endOfMonth(currentMonth);
    return filteredOrders.filter(o => {
      if (!o.scheduledDate) return false;
      const d = parseISO(o.scheduledDate.substring(0, 10));
      return d >= start && d <= end;
    }).length;
  }, [filteredOrders, currentMonth]);

  // Status dropdown state (mesmo padrão da página de OS)
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
  const statusDropdownRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(event.target as Node)) {
        setIsStatusDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="flex flex-col h-full bg-[#f0f4f9] overflow-hidden">

      {/* ── HEADER ── */}
      <header className="px-4 py-2.5 bg-white/90 backdrop-blur-md border-b border-slate-200/60 flex flex-wrap lg:flex-nowrap items-center gap-2 z-30 shadow-sm shrink-0">

        {/* Navegação de mês — compacta */}
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={prevMonth} className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:border-slate-300 transition-all active:scale-90 shadow-sm shrink-0">
            <ChevronLeft size={14} />
          </button>
          <div ref={monthDropdownRef} className="relative px-3 py-1.5 min-w-[108px] text-center bg-white border border-slate-200 rounded-lg shadow-sm hover:border-primary-400 cursor-pointer overflow-visible group shrink-0" onClick={() => setIsMonthDropdownOpen(!isMonthDropdownOpen)}>
            <span className="text-[12px] font-semibold text-slate-800 capitalize block leading-none group-hover:text-primary-600 transition-colors select-none">
              {format(currentMonth, 'MMMM', { locale: ptBR })}
            </span>
            <span className="text-[9px] font-medium text-primary-500 uppercase tracking-widest select-none">
              {format(currentMonth, 'yyyy')}
            </span>
            
            {/* Custom Month Picker Dropdown */}
            {isMonthDropdownOpen && (
              <div className="absolute top-[calc(100%+8px)] left-1/2 -translate-x-1/2 w-[220px] bg-white rounded-xl shadow-xl border border-slate-100 p-3 z-[1000] cursor-default" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2">
                  <button onClick={() => setCurrentMonth(subMonths(currentMonth, 12))} className="p-1 hover:bg-slate-100 rounded text-slate-500">
                    <ChevronLeft size={14} />
                  </button>
                  <span className="text-xs font-bold text-slate-700">{format(currentMonth, 'yyyy')}</span>
                  <button onClick={() => setCurrentMonth(addMonths(currentMonth, 12))} className="p-1 hover:bg-slate-100 rounded text-slate-500">
                    <ChevronRight size={14} />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {Array.from({ length: 12 }).map((_, i) => {
                    const monthDate = new Date(currentMonth.getFullYear(), i, 1);
                    const isSelected = currentMonth.getMonth() === i;
                    return (
                      <button
                        key={i}
                        onClick={() => {
                          setCurrentMonth(monthDate);
                          setIsMonthDropdownOpen(false);
                        }}
                        className={`text-[11px] py-1.5 rounded-md capitalize font-bold transition-all ${isSelected ? 'bg-[#1c2d4f] text-white shadow-md' : 'text-slate-600 hover:bg-slate-100'}`}
                      >
                        {format(monthDate, 'MMM', { locale: ptBR })}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          <button onClick={nextMonth} className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:border-slate-300 transition-all active:scale-90 shadow-sm shrink-0">
            <ChevronRight size={14} />
          </button>
        </div>

        <button
          onClick={goToToday}
          className="h-8 px-3 bg-[#1c2d4f] text-white rounded-lg text-[10px] font-semibold tracking-wider hover:bg-[#253a66] transition-all active:scale-95 shrink-0 flex items-center gap-1.5 shadow"
        >
          <CalendarIcon size={12} className="opacity-70" /> Hoje
        </button>

        {/* Contador do mês */}
        <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 bg-primary-50 border border-primary-100 rounded-lg shrink-0">
          <Layers size={12} className="text-primary-500" />
          <span className="text-[10px] font-semibold text-primary-700">{monthTotal} OS</span>
        </div>

        <div className="h-5 w-px bg-slate-200 mx-0.5 hidden lg:block shrink-0" />

        {/* Filtros */}
        <div className="flex-1 flex flex-wrap md:flex-nowrap items-center gap-2 w-full lg:w-auto">

          {/* Busca */}
          <div className="relative flex-1 min-w-[140px] md:min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
            <input
              type="text"
              placeholder="pesquisar O.S., cliente..."
              className="w-full h-9 bg-white border border-slate-200 rounded-xl py-2 pl-8 pr-3 text-[11px] font-medium text-slate-700 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400 transition-all shadow-sm"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Status Dropdown — padrão página de OS */}
          <div className="relative shrink-0 w-full md:w-[150px]" ref={statusDropdownRef}>
            <button
              onClick={() => { setIsStatusDropdownOpen(!isStatusDropdownOpen); setIsTechDropdownOpen(false); }}
              className="flex items-center justify-between w-full h-9 bg-white border border-slate-200 rounded-xl px-3 text-[11px] font-medium text-slate-700 hover:border-slate-300 transition-all shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20"
            >
              <div className="flex items-center gap-2">
                <Filter size={12} className="text-slate-400" />
                <span className="truncate">{statusFilter === 'ALL' ? 'Todos Status' : (STATUS_LABELS[statusFilter as string] || statusFilter)}</span>
              </div>
              <ChevronRight size={12} className={`text-slate-400 transition-transform ${isStatusDropdownOpen ? 'rotate-90' : ''}`} />
            </button>
            {isStatusDropdownOpen && (
              <div className="absolute top-full left-0 right-0 mt-1.5 bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden z-[1000] py-1">
                <button
                  className={`w-full text-left px-3 py-2 text-[11px] hover:bg-slate-50 transition-colors ${statusFilter === 'ALL' ? 'font-semibold text-primary-600 bg-primary-50/50' : 'text-slate-600'}`}
                  onClick={() => { setStatusFilter('ALL'); setIsStatusDropdownOpen(false); }}
                >
                  Todos Status
                </button>
                {Object.values(OrderStatus).map(s => (
                  <button
                    key={s}
                    className={`w-full text-left px-3 py-2 text-[11px] hover:bg-slate-50 transition-colors flex items-center gap-2 ${statusFilter === s ? 'font-semibold text-primary-600 bg-primary-50/50' : 'text-slate-600'}`}
                    onClick={() => { setStatusFilter(s); setIsStatusDropdownOpen(false); }}
                  >
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: getStatusHexColor(s) }} />
                    {STATUS_LABELS[s] || s}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Técnico Dropdown — mantém o padrão existente */}
          <div className="relative shrink-0 w-full md:w-[160px]" ref={techDropdownRef}>
            <div
              className="w-full h-9 bg-white border border-slate-200 rounded-xl py-2 pl-8 pr-7 text-[11px] font-medium text-slate-700 cursor-pointer shadow-sm flex items-center"
              onClick={() => { setIsTechDropdownOpen(!isTechDropdownOpen); setIsStatusDropdownOpen(false); }}
            >
              <User size={12} className="absolute left-3 text-slate-400" />
              <span className="truncate">
                {techFilter === 'ALL'
                  ? 'Qualquer Técnico'
                  : techs.find(t => t.id === techFilter)?.name || 'Técnico Desconhecido'}
              </span>
              <ChevronRight size={12} className={`absolute right-3 text-slate-400 transition-transform ${isTechDropdownOpen ? 'rotate-90' : ''}`} />
            </div>

            {isTechDropdownOpen && (
              <div className="absolute top-full left-0 right-0 mt-1.5 bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden z-[1000]">
                <div className="p-2 border-b border-slate-100 bg-slate-50/50 sticky top-0">
                  <div className="relative">
                    <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Buscar nome ou email..."
                      className="w-full bg-white border border-slate-200 rounded-lg pl-7 pr-2 py-1.5 text-[10px] font-medium outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-500/20"
                      value={techSearchQuery}
                      onChange={e => setTechSearchQuery(e.target.value)}
                      onClick={e => e.stopPropagation()}
                      autoFocus
                    />
                  </div>
                </div>
                <div className="max-h-56 overflow-y-auto custom-scrollbar">
                  <div
                    className={`px-3 py-2 cursor-pointer text-[11px] font-medium hover:bg-slate-50 transition-colors ${techFilter === 'ALL' ? 'bg-primary-50 text-primary-700' : 'text-slate-700'}`}
                    onClick={() => { setTechFilter('ALL'); setIsTechDropdownOpen(false); setTechSearchQuery(''); }}
                  >
                    Qualquer Técnico
                  </div>
                  {techs.filter(t => {
                    const q = techSearchQuery.toLowerCase();
                    return t.name.toLowerCase().includes(q) || (t.email || '').toLowerCase().includes(q);
                  }).map(t => (
                    <div
                      key={t.id}
                      className={`px-3 py-2 cursor-pointer transition-colors border-t border-slate-50 ${techFilter === t.id ? 'bg-primary-50 text-primary-700' : 'hover:bg-slate-50'}`}
                      onClick={() => { setTechFilter(t.id); setIsTechDropdownOpen(false); setTechSearchQuery(''); }}
                    >
                      <div className="text-[11px] font-medium truncate leading-tight">{t.name}</div>
                      <div className="text-[9px] font-medium text-slate-400 truncate">{t.email || 'sem email'}</div>
                    </div>
                  ))}
                  {techs.filter(t => {
                    const q = techSearchQuery.toLowerCase();
                    return t.name.toLowerCase().includes(q) || (t.email || '').toLowerCase().includes(q);
                  }).length === 0 && (
                    <div className="px-3 py-4 text-center text-[10px] text-slate-400 font-medium">Nenhum técnico encontrado</div>
                  )}
                </div>
              </div>
            )}
          </div>

          {hasActiveFilters && (
            <button
              onClick={() => {
                setSearchTerm('');
                setTechFilter('ALL');
                setStatusFilter('ALL');
              }}
              className="w-8 h-8 flex items-center justify-center bg-rose-50 text-rose-500 hover:bg-rose-500 hover:text-white rounded-lg transition-all shadow-sm shrink-0"
              title="Limpar todos os filtros"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </header>

      {/* ── CALENDÁRIO ── */}
      <main className="flex-1 overflow-hidden flex flex-col p-3 min-h-0">
        <div className="bg-white rounded-2xl shadow-lg shadow-slate-200/50 border border-slate-200/80 overflow-hidden flex flex-col h-full">

          {/* Cabeçalho dias da semana */}
          <div className="grid grid-cols-7 bg-slate-200/60 backdrop-blur-md border-b border-slate-300 shrink-0">
            {['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'].map((d, i) => (
              <div
                key={d}
                className={`py-2 text-center text-[10px] font-semibold tracking-widest uppercase border-r border-slate-300/50 last:border-0 ${
                  i === 0 || i === 6 ? 'text-slate-500' : 'text-slate-600'
                }`}
              >
                {d}
              </div>
            ))}
          </div>

          {/* Grid de dias — 6 linhas */}
          <div className="flex-1 grid grid-cols-7 min-h-0" style={{ gridTemplateRows: 'repeat(6, 1fr)' }}>
            {days.map((day, idx) => {
              const dayOrders = getOrdersForDay(day);
              const isToday = isDateToday(day);
              const isCurrentMonth = isSameMonth(day, currentMonth);
              const isWeekend = idx % 7 === 0 || idx % 7 === 6;

              return (
                <div
                  key={idx}
                  onClick={() => dayOrders.length > 0 && setSelectedDayData({ day, orders: dayOrders })}
                  className={`
                    relative flex flex-col border-r border-b border-slate-100 last:border-r-0 transition-colors min-h-0 overflow-hidden
                    ${isCurrentMonth
                      ? isWeekend ? 'bg-slate-50/60' : 'bg-white'
                      : 'bg-slate-50/30 opacity-50'}
                    ${dayOrders.length > 0 ? 'cursor-pointer hover:bg-blue-50/40' : 'cursor-default'}
                  `}
                >
                  {/* Número do dia */}
                  <div className="flex items-center justify-between px-1.5 pt-1.5 pb-0.5 shrink-0">
                    <div
                      className={`
                        flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-semibold transition-all shrink-0
                        ${isToday
                          ? 'bg-[#1c2d4f] text-white shadow-md'
                          : isCurrentMonth ? 'text-slate-600' : 'text-slate-300'}
                      `}
                    >
                      {format(day, 'd')}
                    </div>

                    {/* Contador no mobile */}
                    {dayOrders.length > 0 && (
                      <div className="md:hidden flex items-center justify-center bg-primary-100 text-primary-700 text-[8px] font-semibold w-5 h-5 rounded-full">
                        {dayOrders.length}
                      </div>
                    )}
                  </div>

                  {/* Lista de OS — desktop */}
                  <div className="hidden md:flex flex-col gap-[2px] px-1 pb-1 overflow-y-auto flex-1 min-h-0"
                    style={{ scrollbarWidth: 'none' }}
                  >
                    {dayOrders.map(order => {
                      const color = getStatusHexColor(order.status);
                      const clientName = order.customerName || 'Cliente';
                      const formattedTime = order.scheduledTime 
                        ? order.scheduledTime.substring(0, 5).replace(/^0/, '')
                        : '';
                      return (
                        <div
                          key={order.id}
                          title={`${order.scheduledTime || ''} — ${order.customerName} | ${order.title}`}
                          className="flex items-center gap-[3px] px-1 py-[2px] rounded hover:bg-slate-100/50 transition-colors"
                        >
                          {/* Bolinha status */}
                          <span
                            className="w-[7px] h-[7px] rounded-full shrink-0"
                            style={{ backgroundColor: color }}
                          />
                          {/* Hora */}
                          {formattedTime && (
                            <span className="text-[10px] font-medium text-slate-500 shrink-0 leading-none tracking-tight">
                              {formattedTime}
                            </span>
                          )}
                          {/* Nome cliente */}
                          <span className="text-[10px] font-medium text-slate-700/90 truncate leading-none flex-1">
                            {clientName}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Fade overflow */}
                  {dayOrders.length > 7 && (
                    <div className="hidden md:block absolute bottom-0 left-0 right-0 h-4 bg-gradient-to-t from-white to-transparent pointer-events-none" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </main>

      {/* ── MODAL: LISTAGEM DO DIA ── */}
      {selectedDayData && !selectedOrder && (
        <div
          className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm"
          onClick={() => setSelectedDayData(null)}
        >
          <div
            className="relative w-full max-w-3xl bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="bg-gradient-to-br from-[#1c2d4f] to-[#2a457a] px-8 py-6 shrink-0 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-6 opacity-5">
                <CalendarIcon size={120} className="rotate-12" />
              </div>
              <button
                onClick={() => setSelectedDayData(null)}
                className="absolute top-4 right-4 p-2.5 bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl text-white transition-all"
              >
                <X size={18} />
              </button>
              <p className="text-[10px] font-semibold text-white/60 tracking-[0.25em] uppercase mb-1">agenda do dia</p>
              <h3 className="text-3xl font-semibold text-white capitalize leading-none">
                {format(selectedDayData.day, "dd ", { locale: ptBR })}
                <span className="font-light">{format(selectedDayData.day, "MMMM yyyy", { locale: ptBR })}</span>
              </h3>
              <div className="mt-3 flex items-center gap-3 flex-wrap">
                <div className="inline-flex items-center gap-1.5 bg-white/15 border border-white/20 rounded-lg px-3 py-1.5">
                  <span className="text-white text-[11px] font-semibold">{selectedDayData.orders.length}</span>
                  <span className="text-white/70 text-[10px] font-medium">ordens de serviço</span>
                </div>
                {/* mini legenda de status */}
                {Array.from(new Set(selectedDayData.orders.map(o => o.status))).map(s => (
                  <div key={s} className="inline-flex items-center gap-1.5 bg-white/10 border border-white/15 rounded-lg px-2.5 py-1">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: getStatusHexColor(s) }} />
                    <span className="text-white/70 text-[9px] font-medium uppercase tracking-wider">{STATUS_LABELS[s] || s}: {selectedDayData.orders.filter(o => o.status === s).length}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Lista */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar bg-slate-50/80">
              {selectedDayData.orders.map(order => {
                const tech = techs.find(t => t.id === order.assignedTo);
                const color = getStatusHexColor(order.status);
                return (
                  <div
                    key={order.id}
                    onClick={() => setSelectedOrder(order)}
                    className="bg-white rounded-xl border border-slate-200 shadow-sm cursor-pointer hover:shadow-md hover:border-primary-200 transition-all active:scale-[0.99] group overflow-hidden"
                  >
                    {/* Faixa de status */}
                    <div className="h-[4px] w-full" style={{ backgroundColor: color }} />

                    <div className="flex items-center gap-3 px-4 py-2.5">
                      {/* Bloco de hora */}
                      <div
                        className="flex flex-col items-center justify-center w-[58px] shrink-0 rounded-lg py-2 border"
                        style={{ backgroundColor: `${color}12`, borderColor: `${color}30` }}
                      >
                        <span className="text-[17px] font-semibold leading-none" style={{ color }}>
                          {order.scheduledTime?.substring(0, 5) || '--:--'}
                        </span>
                        <span className="text-[7px] font-medium uppercase tracking-widest mt-0.5" style={{ color: `${color}99` }}>hora</span>
                      </div>

                      {/* Conteúdo */}
                      <div className="flex-1 min-w-0">
                        {/* Linha 1: título + ID */}
                        <div className="flex items-center gap-2 min-w-0">
                          <p className="text-[13px] font-semibold text-slate-800 truncate leading-tight group-hover:text-primary-700 transition-colors flex-1">
                            {order.title || 'sem título'}
                          </p>
                          <span className="text-[8px] font-medium text-slate-400 uppercase tracking-widest shrink-0">
                            #{order.displayId || order.id.split('-')[0].toUpperCase()}
                          </span>
                        </div>

                        {/* Linha 2: cliente + endereço */}
                        <div className="flex items-center gap-1 mt-0.5">
                          <MapPin size={9} className="text-slate-400 shrink-0" />
                          <span className="text-[10px] font-medium text-slate-600 truncate">
                            {order.customerName || '—'}
                            {order.customerAddress && (
                              <span className="font-normal text-slate-400"> · {order.customerAddress}</span>
                            )}
                          </span>
                        </div>

                        {/* Linha 3: status + técnico + equipamento + tipo inline */}
                        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                          <span
                            className="inline-flex items-center gap-1 text-[8px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full border shrink-0"
                            style={{ color, backgroundColor: `${color}15`, borderColor: `${color}30` }}
                          >
                            <span className="w-1 h-1 rounded-full" style={{ backgroundColor: color }} />
                            {STATUS_LABELS[order.status] || order.status}
                          </span>

                          {order.priority && order.priority !== 'MÉDIA' && (
                            <span className={`text-[9px] font-semibold uppercase px-2 py-0.5 rounded shrink-0 ${
                              order.priority === 'CRÍTICA' ? 'bg-rose-100 text-rose-600' : 
                              order.priority === 'ALTA' ? 'bg-amber-100 text-amber-600' : 
                              'bg-slate-100 text-slate-500'
                            }`}>
                              {order.priority === 'CRÍTICA' ? '🔴 crítica' : 
                               order.priority === 'ALTA' ? '🟡 alta' : 
                               'baixa'}
                            </span>
                          )}

                          {tech && (
                            <span className="flex items-center gap-1 text-[9px] font-medium text-primary-600 shrink-0">
                              <User size={9} />
                              {tech.name.split(' ')[0]}
                            </span>
                          )}

                          {(order.equipmentName || order.equipmentModel) && (
                            <span className="flex items-center gap-1 text-[9px] font-medium text-amber-600 shrink-0">
                              <Box size={9} />
                              {(order.equipmentName || order.equipmentModel || '').split(' ').slice(0, 2).join(' ')}
                            </span>
                          )}

                          {order.operationType && (
                            <span className="text-[8px] font-medium text-slate-400 uppercase tracking-widest bg-slate-100 px-1.5 py-0.5 rounded shrink-0">
                              {order.operationType}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Seta */}
                      <ChevronRight size={15} className="text-slate-300 group-hover:text-primary-500 group-hover:translate-x-0.5 transition-all shrink-0" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: DETALHES DA OS ── */}
      {selectedOrder && (
        <div
          className="fixed inset-0 z-[600] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md"
          onClick={() => setSelectedOrder(null)}
        >
          <div
            className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
            onClick={e => e.stopPropagation()}
          >
            {/* Header colorido por status */}
            <div
              className="relative p-8 shrink-0 overflow-hidden"
              style={{ backgroundColor: getStatusHexColor(selectedOrder.status) }}
            >
              <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '20px 20px' }} />
              <div className="absolute -top-20 -right-20 w-56 h-56 bg-white/10 rounded-full blur-3xl" />

              <div className="relative z-10 flex justify-between items-start">
                <div className="text-white">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="px-2.5 py-1 rounded-full bg-white/20 backdrop-blur-sm border border-white/30 text-[8px] font-semibold uppercase tracking-[0.2em] flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                      {STATUS_LABELS[selectedOrder.status] || selectedOrder.status}
                    </div>
                    <span className="px-2.5 py-1 rounded-full bg-black/20 border border-black/10 text-[8px] font-semibold uppercase">
                      OS #{selectedOrder.displayId || selectedOrder.id.split('-')[0]}
                    </span>
                    {selectedOrder.priority && (
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider shadow-sm ${
                        selectedOrder.priority === 'CRÍTICA' ? 'bg-rose-500 text-white' : 
                        selectedOrder.priority === 'ALTA' ? 'bg-amber-400 text-amber-900' :
                        selectedOrder.priority === 'BAIXA' ? 'bg-slate-200 text-slate-600' :
                        'bg-white/20 text-white'
                      }`}>
                        {selectedOrder.priority === 'CRÍTICA' ? '🔴 Crítica' : 
                         selectedOrder.priority === 'ALTA' ? '🟡 Alta' : 
                         selectedOrder.priority === 'BAIXA' ? 'Baixa' : 'Média'}
                      </span>
                    )}
                  </div>
                  <h2 className="text-2xl font-semibold tracking-tight leading-tight max-w-[85%] drop-shadow-lg">
                    {selectedOrder.title || 'manutenção programada'}
                  </h2>
                </div>

                <button
                  onClick={() => setSelectedOrder(null)}
                  className="p-3 bg-white/10 hover:bg-white/20 border border-white/20 rounded-2xl text-white transition-all active:scale-75"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Corpo */}
            <div className="p-6 flex-1 overflow-y-auto custom-scrollbar bg-slate-50 space-y-6">

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Cliente */}
                <div className="bg-white p-5 rounded-2xl shadow-lg shadow-slate-200/50 border border-slate-200 flex gap-4 items-start">
                  <div className="w-11 h-11 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center shrink-0">
                    <MapPin size={20} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[9px] font-semibold uppercase tracking-widest text-slate-400 mb-1">cliente / local</p>
                    <p className="text-sm font-medium text-slate-800 leading-tight">{selectedOrder.customerName}</p>
                    <p className="text-[10px] font-medium text-slate-500 mt-1 truncate">{selectedOrder.customerAddress || 'endereço não cadastrado'}</p>
                  </div>
                </div>

                {/* Data */}
                <div className="bg-white p-5 rounded-2xl shadow-lg shadow-slate-200/50 border border-slate-200 flex gap-4 items-start">
                  <div className="w-11 h-11 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center shrink-0">
                    <Clock size={20} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[9px] font-semibold uppercase tracking-widest text-slate-400 mb-1">agendamento</p>
                    <p className="text-sm font-medium text-slate-800 capitalize leading-tight">
                      {selectedOrder.scheduledDate
                        ? format(parseISO(selectedOrder.scheduledDate), "EEEE, dd 'de' MMMM", { locale: ptBR })
                        : 'data indefinida'}
                    </p>
                    <p className="text-[10px] font-semibold text-emerald-600 mt-1 uppercase tracking-widest bg-emerald-50 px-2 py-0.5 rounded w-fit">
                      {selectedOrder.scheduledTime || '--:--'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Técnico */}
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-lg shadow-slate-200/50">
                  <p className="text-[9px] font-semibold uppercase tracking-widest text-slate-400 mb-2">responsável técnico</p>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-slate-900 text-white rounded-full flex items-center justify-center font-semibold text-sm shrink-0">
                      {techs.find(t => t.id === selectedOrder.assignedTo)?.name?.charAt(0) || <User size={14} />}
                    </div>
                    <p className="text-sm font-medium text-slate-800">
                      {techs.find(t => t.id === selectedOrder.assignedTo)?.name || 'não atribuído'}
                    </p>
                  </div>
                </div>

                {/* Equipamento */}
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-lg shadow-slate-200/50">
                  <p className="text-[9px] font-semibold uppercase tracking-widest text-slate-400 mb-2">ativo vinculado</p>
                  <div className="flex items-center gap-3">
                    <div className="bg-amber-50 text-amber-600 p-2 rounded-lg shrink-0"><Box size={16} /></div>
                    <div>
                      <p className="text-xs font-medium text-slate-800">{selectedOrder.equipmentName || 'manutenção geral'}</p>
                      <p className="text-[10px] text-slate-500 font-medium">{selectedOrder.equipmentModel || '--'}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Descrição */}
              {selectedOrder.description && (
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-lg shadow-slate-200/50">
                  <p className="text-[9px] font-semibold uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-1.5">
                    <AlertCircle size={12} /> observações
                  </p>
                  <p className="text-xs text-slate-600 leading-relaxed font-medium whitespace-pre-wrap">
                    {selectedOrder.description}
                  </p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-5 bg-white border-t border-slate-200 flex justify-end shrink-0">
              <button
                onClick={() => {
                  const url = `${window.location.origin}/#/order/view/${selectedOrder.publicToken || selectedOrder.id}`;
                  window.open(url, '_blank');
                }}
                className="flex items-center gap-2 px-6 py-3 bg-[#1c2d4f] text-white rounded-xl text-[10px] font-semibold tracking-[0.15em] hover:bg-[#253a66] transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 w-full md:w-auto justify-center"
              >
                abrir detalhes da OS <ExternalLink size={13} />
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
        :where([style*="scroll-bar"])::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
};
