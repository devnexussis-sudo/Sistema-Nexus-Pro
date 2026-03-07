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
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { ServiceOrder, User as TechUser, Customer, OrderStatus } from '../../types';
import { getStatusCalendarStyle, getStatusColor } from '../../lib/statusColors';

interface OrderCalendarProps {
  orders: ServiceOrder[];
  techs: TechUser[];
  customers: Customer[];
}

// Map Status to Hex colors for dynamic gradient accents
const getStatusHexColor = (status: OrderStatus) => {
  switch (status) {
    case OrderStatus.PENDING: return '#3b82f6'; // Azul
    case OrderStatus.ASSIGNED: return '#1d4ed8'; // Azul Escuro
    case OrderStatus.TRAVELING: return '#f59e0b'; // Laranja
    case OrderStatus.ARRIVED: return '#8b5cf6'; // Roxo
    case OrderStatus.IN_PROGRESS: return '#eab308'; // Amarelo
    case OrderStatus.PAUSED: return '#6b7280'; // Cinza
    case OrderStatus.COMPLETED: return '#10b981'; // Verde
    case OrderStatus.CANCELED: return '#d946ef'; // Rosa
    case OrderStatus.BLOCKED: return '#ef4444'; // Vermelho
    default: return '#94a3b8';
  }
};

export const OrderCalendar: React.FC<OrderCalendarProps> = ({ orders, techs, customers }) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [searchTerm, setSearchTerm] = useState('');
  const [techFilter, setTechFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'ALL'>('ALL'); // Default: Todos
  const [selectedDayData, setSelectedDayData] = useState<{ day: Date, orders: ServiceOrder[] } | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<ServiceOrder | null>(null);

  const handleDayClick = (day: Date, dayOrders: ServiceOrder[]) => {
    if (dayOrders.length > 0) {
      setSelectedDayData({ day, orders: dayOrders });
    }
  };

  const handleOrderClick = (order: ServiceOrder) => {
    setSelectedOrder(order);
  };

  // Filtros
  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      const term = searchTerm.toLowerCase();
      const matchesSearch = (order.title || '').toLowerCase().includes(term) ||
        (order.customerName || '').toLowerCase().includes(term) ||
        (order.id || '').toLowerCase().includes(term) ||
        (order.displayId || '').toLowerCase().includes(term);

      const matchesStatus = statusFilter === 'ALL' || order.status === statusFilter;

      const assignedTech = techs.find(t => t.id === order.assignedTo);
      const techName = assignedTech ? assignedTech.name.toLowerCase() : '';
      const matchesTech = techFilter === 'ALL' || techName.includes(techFilter.toLowerCase());

      return matchesSearch && matchesStatus && matchesTech;
    });
  }, [orders, techs, searchTerm, statusFilter, techFilter]);

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 0 });
    let interval = eachDayOfInterval({ start, end });

    // Garantir 6 semanas (42 dias) sempre
    while (interval.length < 42) {
      interval.push(addDays(interval[interval.length - 1], 1));
    }
    return interval;
  }, [currentMonth]);

  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
  const goToToday = () => setCurrentMonth(new Date());

  const getOrdersForDay = (day: Date) => {
    return filteredOrders.filter(order => {
      const orderDate = order.scheduledDate;
      if (!orderDate) return false;
      return isSameDay(parseISO(orderDate.substring(0, 10)), day);
    });
  };

  const getStatusStyle = getStatusCalendarStyle;

  return (
    <div className="flex flex-col h-full bg-[#f4f7fb] overflow-hidden">
      {/* HEADER ELEGANTE COM EFEITO GLASS */}
      <header className="px-6 py-4 bg-white/80 backdrop-blur-md border-b border-slate-200/50 flex flex-wrap lg:flex-nowrap items-center gap-4 z-30 shadow-sm shrink-0">

        {/* Controle Mês/Ano com microinterações */}
        <div className="flex items-center bg-white rounded-2xl p-1.5 shadow-sm border border-slate-100 shrink-0">
          <button onClick={prevMonth} className="p-2 hover:bg-slate-50 rounded-xl text-slate-500 transition-all active:scale-95"><ChevronLeft size={18} /></button>
          <div className="px-4 flex flex-col items-center justify-center min-w-[140px]">
            <span className="text-[14px] font-black text-slate-800 capitalize leading-none mb-0.5">{format(currentMonth, 'MMMM', { locale: ptBR })}</span>
            <span className="text-[9px] font-black text-primary-500 uppercase tracking-widest">{format(currentMonth, 'yyyy')}</span>
          </div>
          <button onClick={nextMonth} className="p-2 hover:bg-slate-50 rounded-xl text-slate-500 transition-all active:scale-95"><ChevronRight size={18} /></button>
        </div>

        <button onClick={goToToday} className="px-5 py-3.5 bg-gradient-to-br from-[#1c2d4f] to-[#2a457a] text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:shadow-lg hover:shadow-[#1c2d4f]/30 transition-all active:scale-95 shrink-0 flex items-center gap-2">
          <CalendarIcon size={14} className="opacity-70" /> Hoje
        </button>

        <div className="h-8 w-px bg-slate-200 mx-2 hidden lg:block"></div>

        {/* Filtros Padronizados Modernizados */}
        <div className="flex-1 flex flex-wrap md:flex-nowrap items-center gap-3 w-full lg:w-auto mt-2 lg:mt-0">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder="Pesquisar O.S., Cliente, etc..."
              className="w-full bg-white border border-slate-200 rounded-2xl py-3.5 pl-11 pr-4 text-[11px] font-bold text-slate-700 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all shadow-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className="relative shrink-0 flex-1 md:flex-none min-w-[180px]">
              <User size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 z-10" />
              <select
                className="w-full bg-white border border-slate-200 rounded-2xl py-3.5 pl-10 pr-8 text-[10px] font-bold uppercase tracking-wider text-slate-700 outline-none focus:ring-2 focus:ring-primary-500/20 transition-all cursor-pointer shadow-sm appearance-none"
                value={techFilter}
                onChange={(e) => setTechFilter(e.target.value)}
              >
                <option value="ALL">Qualquer Técnico</option>
                {techs.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
              </select>
            </div>

            <div className="relative shrink-0 flex-1 md:flex-none min-w-[160px]">
              <Layers size={14} className={`absolute left-3.5 top-1/2 -translate-y-1/2 z-10 ${statusFilter === 'ALL' ? 'text-slate-400' : 'text-primary-600'}`} />
              <select
                className={`w-full border rounded-2xl py-3.5 pl-10 pr-8 text-[10px] font-bold uppercase tracking-wider outline-none transition-all cursor-pointer shadow-sm appearance-none ${statusFilter === 'ALL' ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50' : 'bg-primary-50 border-primary-200 text-primary-700 ring-2 ring-primary-100'}`}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
              >
                <option value="ALL">Todo Status</option>
                {Object.values(OrderStatus).map(s => <option key={s} value={s}>{s === OrderStatus.PENDING ? '📍 AGENDADAS' : s.toUpperCase()}</option>)}
              </select>
            </div>
          </div>
        </div>
      </header>

      {/* GRID DO CALENDÁRIO */}
      <main className="flex-1 overflow-hidden flex flex-col p-4 pt-2 lg:p-6 min-h-0 bg-[#f0f4f9]">

        <div className="bg-white rounded-[2rem] shadow-sm border border-slate-200/60 overflow-hidden flex flex-col h-full ring-1 ring-slate-900/5">
          {/* DIAS DA SEMANA */}
          <div className="grid grid-cols-7 bg-slate-50/50 shrink-0 border-b border-slate-100">
            {['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'].map((day, i) => (
              <div key={day} className={`py-3 text-center text-[10px] font-black uppercase tracking-widest ${i === 0 || i === 6 ? 'text-slate-400' : 'text-slate-600'}`}>
                <span className="hidden md:inline">{day}</span>
                <span className="md:hidden">{day.substring(0, 3)}</span>
              </div>
            ))}
          </div>

          {/* GRID DE DIAS */}
          <div className="flex-1 grid grid-cols-7 auto-rows-fr bg-slate-200/50 min-h-0">
            {days.map((day, idx) => {
              const dayOrders = getOrdersForDay(day);
              const isToday = isDateToday(day);
              const isCurrentMonth = isSameMonth(day, currentMonth);

              // Sort dayOrders by time if possible
              dayOrders.sort((a, b) => (a.scheduledTime || '') > (b.scheduledTime || '') ? 1 : -1);

              return (
                <div
                  key={idx}
                  onClick={() => handleDayClick(day, dayOrders)}
                  className={`
                    relative p-1 md:p-2 border-r border-b border-transparent transition-all group min-h-0 cursor-text overflow-hidden
                    ${isCurrentMonth ? 'bg-white hover:bg-blue-50/30' : 'bg-slate-50/50 opacity-60'} 
                    ${dayOrders.length > 0 ? 'cursor-pointer' : ''}
                    `}
                  style={{ borderColor: '#f1f5f9' }}
                >
                  {/* Indicador de Dia e Bolinha do Hoje */}
                  <div className="flex justify-between items-start mb-1 h-6">
                    <div className={`
                            flex items-center justify-center w-7 h-7 rounded-full text-xs font-black transition-all
                            ${isToday ? 'bg-[#1c2d4f] text-white shadow-lg shadow-[#1c2d4f]/20 scale-110' : 'text-slate-400 group-hover:text-slate-900'}
                            ${!isCurrentMonth && !isToday ? 'text-slate-300' : ''}
                        `}>
                      {format(day, 'd')}
                    </div>

                    {/* Summary Pill for mobile or lots of items */}
                    {dayOrders.length > 0 && (
                      <div className="md:hidden flex items-center justify-center bg-primary-100 text-primary-700 text-[9px] font-black w-6 h-6 rounded-full mt-0.5 mr-0.5">
                        {dayOrders.length}
                      </div>
                    )}
                  </div>

                  {/* RENDERING DE OS NO DIA (Apenas Desktop / Telas maiores) */}
                  <div className="hidden md:flex flex-col gap-1 overflow-y-auto custom-scrollbar-thin max-h-[calc(100%-28px)] pr-1 pb-1">
                    {dayOrders.map((order, i) => {
                      const colorHex = getStatusHexColor(order.status);
                      return (
                        <div
                          key={order.id}
                          title={`${order.scheduledTime || ''} - ${order.title} (${order.customerName})`}
                          className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg border shadow-sm pointer-events-none transition-transform group-hover/item:scale-[1.02]"
                          style={{ borderColor: `${colorHex}40`, backgroundColor: `${colorHex}15` }}
                        >
                          <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: colorHex }}></div>
                          <span className="text-[9px] font-bold text-slate-800 truncate leading-none flex-1">
                            {order.scheduledTime ? `${order.scheduledTime} ` : ''}{order.customerName.split(' ')[0]}
                          </span>
                        </div>
                      )
                    })}
                  </div>

                  {/* Gradient Fade for overflow lines */}
                  {dayOrders.length > 3 && (
                    <div className="hidden md:block absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-white to-transparent pointer-events-none"></div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </main>

      {/* MODAL DE LISTAGEM DO DIA */}
      {selectedDayData && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 md:p-6 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="relative w-full max-w-md bg-white rounded-[2rem] shadow-2xl border border-white/20 overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col max-h-[85vh]">

            {/* Header Decorativo */}
            <div className="bg-gradient-to-br from-[#1c2d4f] to-[#253a66] p-6 pb-8 relative overflow-hidden shrink-0">
              <div className="absolute top-0 right-0 p-8 opacity-10">
                <CalendarIcon size={120} className="transform rotate-12" />
              </div>

              <button
                onClick={(e) => { e.stopPropagation(); setSelectedDayData(null); }}
                className="absolute top-4 right-4 p-3 bg-white/10 hover:bg-white/20 border border-white/20 rounded-2xl text-white backdrop-blur-md transition-all active:scale-75 z-[60]"
                title="Fechar Agenda"
              >
                <X size={20} />
              </button>

              <p className="text-[12px] font-black text-white uppercase tracking-[0.2em] mb-1 drop-shadow-sm">Agenda do Dia</p>
              <h3 className="text-3xl font-black text-white capitalize leading-none drop-shadow-md">
                {format(selectedDayData.day, "dd ", { locale: ptBR })}
                <span className="font-light">{format(selectedDayData.day, "MMMM", { locale: ptBR })}</span>
              </h3>
            </div>

            {/* Content list */}
            <div className="flex-1 overflow-y-auto px-4 pb-4 -mt-4 z-10 custom-scrollbar">
              <div className="flex items-center justify-between mb-3 px-2">
                <span className="text-[11px] font-black text-white/90 uppercase tracking-widest drop-shadow-sm">{selectedDayData.orders.length} agendamentos</span>
              </div>

              <div className="space-y-3">
                {selectedDayData.orders.map(order => {
                  const tech = techs.find(t => t.id === order.assignedTo);
                  const colorHex = getStatusHexColor(order.status);

                  return (
                    <div
                      key={order.id}
                      onClick={() => handleOrderClick(order)}
                      className="group flex flex-col md:flex-row items-stretch gap-4 p-4 rounded-3xl border shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] transition-all cursor-pointer hover:scale-[1.02] hover:shadow-[0_8px_30px_-4px_rgba(0,0,0,0.1)] active:scale-95"
                      style={{ backgroundColor: `${colorHex}05`, borderColor: `${colorHex}20` }}
                    >
                      {/* Time Column */}
                      <div className="flex flex-row md:flex-col items-center justify-center shrink-0 min-w-[60px] md:border-r border-slate-100 pr-0 md:pr-4">
                        <span className="text-[16px] font-black text-slate-900 tracking-tighter">{order.scheduledTime || '--:--'}</span>
                        <span className="text-[8px] font-black uppercase text-slate-400 mt-1 hidden md:block">Hora</span>
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0 flex flex-col justify-center">
                        <div className="flex items-center gap-2 mb-1.5">
                          <div className="px-2 py-0.5 rounded-md text-[7px] font-black uppercase tracking-wider text-white" style={{ backgroundColor: colorHex }}>
                            {order.status}
                          </div>
                          <span className="text-[9px] font-black text-slate-400 capitalize bg-slate-100 px-2 py-0.5 rounded-md">#{order.displayId || 'S/N'}</span>
                        </div>

                        <h4 className="text-[13px] font-bold text-slate-800 leading-tight truncate mb-1.5">{order.title || 'Sem título'}</h4>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-auto">
                          <div className="flex items-center gap-1.5 text-[9px] font-bold text-slate-500">
                            <MapPin size={10} className="text-slate-400" />
                            <span className="truncate max-w-[120px]">{order.customerName}</span>
                          </div>
                          {tech && (
                            <div className="flex items-center gap-1.5 text-[9px] font-bold text-slate-500">
                              <User size={10} className="text-slate-400" />
                              <span className="truncate max-w-[100px] text-primary-600">{tech.name.split(' ')[0]}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="hidden md:flex items-center text-slate-300 group-hover:text-primary-500 transition-colors">
                        <ChevronRight size={18} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE DETALHES COMPLETO - ULTRA MODERNIZADO */}
      {selectedOrder && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 md:p-6 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
          <div className="relative w-full max-w-2xl bg-white rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col max-h-[92vh]">

            {/* Header Super Premium */}
            <div className="relative p-8 md:p-10 shrink-0 overflow-hidden" style={{ backgroundColor: getStatusHexColor(selectedOrder.status) }}>
              {/* Patterns overlay */}
              <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '24px 24px' }}></div>
              <div className="absolute -top-24 -right-24 w-64 h-64 bg-white/10 rounded-full blur-3xl"></div>
              <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-black/10 rounded-full blur-3xl"></div>

              <div className="relative z-10 flex justify-between items-start">
                <div className="text-white">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="px-3 py-1 rounded-full bg-white/20 backdrop-blur-sm border border-white/30 text-[9px] font-black uppercase tracking-[0.2em] flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span>
                      {selectedOrder.status}
                    </div>
                    <span className="px-3 py-1 rounded-full bg-black/20 backdrop-blur-sm border border-black/10 text-[9px] font-black uppercase tracking-[0.1em]">
                      OS #{selectedOrder.displayId || selectedOrder.id.split('-')[0]}
                    </span>
                  </div>
                  <h2 className="text-3xl md:text-4xl font-black tracking-tight leading-tight max-w-[80%] drop-shadow-lg">
                    {selectedOrder.title || 'Manutenção Programada'}
                  </h2>
                </div>

                <button
                  onClick={(e) => { e.stopPropagation(); setSelectedOrder(null); }}
                  className="p-4 bg-white/10 hover:bg-white/20 border border-white/20 rounded-2xl text-white backdrop-blur-md transition-all active:scale-75 z-[60]"
                  title="Fechar Detalhes"
                >
                  <X size={22} />
                </button>
              </div>
            </div>

            {/* Conteúdo Detalhado - Scrollable */}
            <div className="p-8 md:p-10 flex-1 overflow-y-auto custom-scrollbar bg-slate-50 space-y-8">

              {/* Grid 1: Cliente e Data */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Cliente Card */}
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex gap-5 items-center">
                  <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center shrink-0">
                    <MapPin size={24} />
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Cliente / Local</p>
                    <p className="text-sm font-bold text-slate-800 leading-tight">{selectedOrder.customerName}</p>
                    <p className="text-[10px] font-bold text-slate-500 mt-1 truncate">{selectedOrder.customerAddress || 'Endereço não cadastrado'}</p>
                  </div>
                </div>

                {/* Data Card */}
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex gap-5 items-center">
                  <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center shrink-0">
                    <Clock size={24} />
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Agendamento</p>
                    <p className="text-sm font-bold text-slate-800 capitalize leading-tight">
                      {selectedOrder.scheduledDate ? format(parseISO(selectedOrder.scheduledDate), "EEEE, dd 'de' MMMM", { locale: ptBR }) : 'Data Indefinida'}
                    </p>
                    <p className="text-[11px] font-black text-emerald-600 mt-1 uppercase tracking-widest bg-emerald-50 px-2 py-0.5 rounded w-fit">
                      H: {selectedOrder.scheduledTime || '--:--'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Grid 2: Técnico e Equipamento */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-3">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.1em] border-b border-slate-200 pb-2">Responsável Técnico</h4>
                  <div className="flex items-center gap-4 bg-white p-4 rounded-2xl border border-slate-100">
                    <div className="w-10 h-10 bg-slate-900 text-white rounded-full flex items-center justify-center font-black">
                      {techs.find(t => t.id === selectedOrder.assignedTo)?.name?.charAt(0) || <User size={16} />}
                    </div>
                    <p className="text-sm font-black text-slate-800 tracking-tight">
                      {techs.find(t => t.id === selectedOrder.assignedTo)?.name || 'Não Atribuído'}
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.1em] border-b border-slate-200 pb-2">Ativo Vinculado</h4>
                  <div className="bg-white p-4 rounded-2xl border border-slate-100 flex items-start gap-4">
                    <div className="bg-amber-50 text-amber-600 p-2.5 rounded-xl shrink-0"><Box size={18} /></div>
                    <div>
                      <p className="text-xs font-black text-slate-800">{selectedOrder.equipmentName || 'Manutenção Geral'}</p>
                      <p className="text-[10px] text-slate-500 font-bold mt-0.5">{selectedOrder.equipmentModel || '--'}</p>
                      {selectedOrder.equipmentSerial && (
                        <p className="text-[9px] text-slate-400 font-black mt-1 uppercase bg-slate-100 px-2 py-0.5 inline-block rounded">
                          SN: {selectedOrder.equipmentSerial}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Descrição */}
              {selectedOrder.description && (
                <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-[inset_0_2px_10px_rgba(0,0,0,0.02)]">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.1em] mb-3 flex items-center gap-2">
                    <AlertCircle size={14} /> Observações da Ordem
                  </h4>
                  <p className="text-xs text-slate-600 leading-relaxed font-medium whitespace-pre-wrap">
                    {selectedOrder.description}
                  </p>
                </div>
              )}

            </div>

            {/* Footer Ações */}
            <div className="p-6 md:p-8 bg-white border-t border-slate-100 flex justify-end shrink-0">
              <button
                onClick={() => {
                  const publicUrl = `${window.location.origin}/#/order/view/${selectedOrder.publicToken || selectedOrder.id}`;
                  window.open(publicUrl, '_blank');
                }}
                className="flex items-center justify-center gap-3 px-8 py-4 bg-[#1c2d4f] text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-primary-600 transition-all shadow-lg hover:shadow-xl hover:-translate-y-1 w-full md:w-auto"
              >
                Detalhes no Painel OS <ExternalLink size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .custom-scrollbar-thin::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar-thin::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar-thin::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f8fafc;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #94a3b8;
          border-radius: 10px;
        }
      `}</style>
    </div>
  );
};
