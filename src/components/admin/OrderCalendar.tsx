
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
  parseISO
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { 
  ChevronLeft, 
  ChevronRight, 
  Search, 
  User, 
  ExternalLink,
  Clock
} from 'lucide-react';
import { ServiceOrder, User as TechUser, Customer, OrderStatus } from '../../types';

interface OrderCalendarProps {
  orders: ServiceOrder[];
  techs: TechUser[];
  customers: Customer[];
}

export const OrderCalendar: React.FC<OrderCalendarProps> = ({ orders, techs, customers }) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [searchTerm, setSearchTerm] = useState('');
  const [techFilter, setTechFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState(OrderStatus.PENDING); // Default: Agendadas
  
  // Filtros idênticos à página de atividades
  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      const term = searchTerm.toLowerCase();
      const matchesSearch = (order.title || '').toLowerCase().includes(term) ||
        (order.customerName || '').toLowerCase().includes(term) ||
        (order.id || '').toLowerCase().includes(term);

      const matchesStatus = statusFilter === 'ALL' || order.status === statusFilter;

      const assignedTech = techs.find(t => t.id === order.assignedTo);
      const techName = assignedTech ? assignedTech.name.toLowerCase() : '';
      const matchesTech = techFilter === 'ALL' || techName.includes(techFilter.toLowerCase());

      return matchesSearch && matchesStatus && matchesTech;
    });
  }, [orders, techs, searchTerm, statusFilter, techFilter]);

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentMonth));
    const end = endOfWeek(endOfMonth(currentMonth));
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
  const goToToday = () => setCurrentMonth(new Date());

  const getOrdersForDay = (day: Date) => {
    return filteredOrders.filter(order => {
      const orderDate = order.scheduledDate; // Seguindo a do agendamento
      if (!orderDate) return false;
      return isSameDay(parseISO(orderDate.substring(0, 10)), day);
    });
  };

  const getStatusColor = (status: OrderStatus) => {
    switch (status) {
      case OrderStatus.COMPLETED: return 'bg-emerald-100 text-emerald-700 border-emerald-200 shadow-sm';
      case OrderStatus.IN_PROGRESS: return 'bg-blue-100 text-blue-700 border-blue-200 shadow-sm';
      case OrderStatus.PENDING: return 'bg-amber-100 text-amber-700 border-amber-200 shadow-sm';
      case OrderStatus.CANCELED: return 'bg-red-100 text-red-700 border-red-200 shadow-sm';
      case OrderStatus.BLOCKED: return 'bg-slate-100 text-slate-700 border-slate-200 shadow-sm';
      default: return 'bg-gray-100 text-gray-700 border-gray-200 shadow-sm';
    }
  };

  const handleOrderClick = (order: ServiceOrder) => {
    const publicUrl = `${window.location.origin}/#/view/${order.publicToken || order.id}`;
    window.open(publicUrl, '_blank');
  };

  return (
    <div className="flex flex-col h-full bg-[#f1f5f9] rounded-[2.5rem] shadow-2xl border border-slate-200 overflow-hidden">
      {/* COMPACT HEADER & FILTERS */}
      <div className="p-4 px-8 border-b border-slate-200 bg-white/80 backdrop-blur-md z-20">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center bg-slate-100 rounded-2xl p-1 border border-slate-200 shrink-0">
            <button onClick={prevMonth} className="p-2 hover:bg-white rounded-xl text-slate-500 transition-all active:scale-95 shadow-none hover:shadow-sm"><ChevronLeft size={18} /></button>
            <div className="px-4 text-[11px] font-black text-slate-900 uppercase italic min-w-[140px] text-center tracking-tighter">
              {format(currentMonth, 'MMMM yyyy', { locale: ptBR })}
            </div>
            <button onClick={nextMonth} className="p-2 hover:bg-white rounded-xl text-slate-500 transition-all active:scale-95 shadow-none hover:shadow-sm"><ChevronRight size={18} /></button>
          </div>

          <button onClick={goToToday} className="px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-indigo-700 transition-all active:scale-95 shadow-lg shadow-indigo-200 shrink-0">Hoje</button>

          <div className="h-8 w-px bg-slate-200 mx-2 hidden lg:block"></div>

          <div className="flex-1 flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
               <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
               <input 
                 type="text"
                 placeholder="BUSCAR OS..."
                 className="w-full bg-slate-100 border border-slate-200 rounded-xl py-2.5 pl-11 pr-4 text-[9px] font-black uppercase tracking-widest outline-none focus:bg-white focus:border-indigo-500 transition-all italic"
                 value={searchTerm}
                 onChange={(e) => setSearchTerm(e.target.value)}
               />
            </div>

            <div className="flex items-center gap-2">
              <select 
                className="bg-slate-100 border border-slate-200 rounded-xl py-2.5 px-4 text-[9px] font-black uppercase tracking-widest outline-none focus:bg-white focus:border-indigo-500 transition-all cursor-pointer"
                value={techFilter}
                onChange={(e) => setTechFilter(e.target.value)}
              >
                 <option value="ALL">TODOS OS TÉCNICOS</option>
                 {techs.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
              </select>

              <select 
                className={`border rounded-xl py-2.5 px-4 text-[9px] font-black uppercase tracking-widest outline-none transition-all cursor-pointer ${statusFilter === 'ALL' ? 'bg-slate-100 border-slate-200' : 'bg-indigo-50 border-indigo-200 text-indigo-700'}`}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
              >
                 <option value="ALL">TODOS STATUS</option>
                 {Object.values(OrderStatus).map(s => <option key={s} value={s}>{s === OrderStatus.PENDING ? '📍 AGENDADAS' : s}</option>)}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* CALENDÁRIO GRID */}
      <div className="flex-1 overflow-auto p-4 custom-scrollbar">
        <div className="min-w-[1000px] h-full flex flex-col">
          <div className="grid grid-cols-7 mb-3">
            {['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'].map(day => (
              <div key={day} className="text-center py-1 text-[8px] font-black text-slate-400 uppercase tracking-[0.3em] italic">
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-px bg-slate-200 border border-slate-200 rounded-[2.5rem] overflow-hidden shadow-inner flex-1">
            {days.map((day, idx) => {
              const dayOrders = getOrdersForDay(day);
              const isToday = isSameDay(day, new Date());
              const isCurrentMonth = isSameMonth(day, currentMonth);

              return (
                <div 
                  key={idx}
                  className={`min-h-[140px] flex flex-col transition-all group ${isCurrentMonth ? 'bg-white' : 'bg-slate-50/50 opacity-40'} ${isToday ? 'bg-indigo-50/20' : ''}`}
                >
                  <div className={`p-3 flex justify-between items-center ${isToday ? 'bg-indigo-500/10' : ''}`}>
                    <span className={`text-base font-black italic tracking-tighter ${isToday ? 'text-indigo-600 scale-110 drop-shadow-sm' : 'text-slate-400 group-hover:text-slate-900'} transition-all`}>
                      {format(day, 'd')}
                    </span>
                    {dayOrders.length > 0 && (
                       <span className={`text-[8px] font-black px-2 py-0.5 rounded-full border ${isToday ? 'bg-indigo-500 text-white border-indigo-600' : 'bg-slate-900 text-white border-slate-900'}`}>
                         {dayOrders.length}
                       </span>
                    )}
                  </div>

                  <div className="flex-1 p-2 space-y-1.5 overflow-y-auto max-h-[120px] custom-scrollbar">
                    {dayOrders.map(order => {
                      const tech = techs.find(t => t.id === order.assignedTo);
                      return (
                        <div 
                          key={order.id}
                          onClick={() => handleOrderClick(order)}
                          className={`group relative h-7 flex items-center px-3 rounded-lg border text-[9px] font-black uppercase tracking-tight cursor-pointer transition-all hover:translate-x-1 hover:shadow-lg active:scale-95 z-10 ${getStatusColor(order.status)}`}
                        >
                          <span className="truncate flex-1">{order.customerName}</span>
                          <span className="text-[7px] font-black opacity-50 italic">{order.scheduledTime || '--:--'}</span>
                          
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 w-64 p-5 bg-slate-900 text-white rounded-[2rem] shadow-2xl opacity-0 group-hover:opacity-100 pointer-events-none transition-all z-[100] border border-white/10 scale-90 group-hover:scale-100 origin-bottom backdrop-blur-md">
                             <div className="space-y-4">
                                <div className="flex justify-between items-start">
                                  <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">OS #{order.id}</span>
                                  <div className="px-2 py-1 bg-white/10 rounded-lg text-[7px] font-black uppercase tracking-widest">{order.status}</div>
                                </div>
                                
                                <div>
                                  <p className="text-[7px] text-white/40 font-black uppercase tracking-widest mb-1.5">Cliente / Unidade</p>
                                  <p className="text-[10px] font-black uppercase italic leading-tight">{order.customerName}</p>
                                </div>

                                <div className="flex justify-between gap-4 pt-3 border-t border-white/5">
                                   <div className="flex-1">
                                      <p className="text-[7px] text-white/40 font-black uppercase tracking-widest mb-1.5">Técnico em Campo</p>
                                      <div className="flex items-center gap-2">
                                         <div className="w-5 h-5 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
                                            <User size={10} />
                                         </div>
                                         <span className="text-[9px] font-black uppercase truncate">{tech?.name || 'Não Atribuído'}</span>
                                      </div>
                                   </div>
                                   <div className="text-right">
                                      <p className="text-[7px] text-white/40 font-black uppercase tracking-widest mb-1.5">Agendamento</p>
                                      <div className="flex items-center justify-end gap-1.5 text-emerald-400">
                                         <Clock size={10} />
                                         <span className="text-[10px] font-black italic">{order.scheduledTime || '--:--'}</span>
                                      </div>
                                   </div>
                                </div>

                                <div className="flex items-center justify-center gap-2 pt-1 text-[8px] font-black text-indigo-400 animate-pulse tracking-widest uppercase italic">
                                   <ExternalLink size={10} />
                                   Abrir Relatório Público
                                </div>
                             </div>
                             <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-[8px] border-transparent border-t-slate-900"></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 10px;
        }
      `}</style>
    </div>
  );
};
