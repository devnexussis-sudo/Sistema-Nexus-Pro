
import React, { useState, useMemo, useEffect } from 'react';
import { OrderStatus, OrderPriority, type ServiceOrder, type User, type Customer } from '../../types';
import { Button } from '../ui/Button';
import { StatusBadge, PriorityBadge } from '../ui/StatusBadge';
import {
  Plus, Printer, X, FileText, CheckCircle2, ShieldCheck,
  Edit3, ExternalLink, Search, Filter, Calendar, Share2,
  Users, UserCheck, Clock, FileSpreadsheet, Download, Camera, ClipboardList, Ban, MapPin, Box,
  DollarSign, Eye, EyeOff, LayoutDashboard, User as UserIcon, AlertTriangle, ArrowUpDown, ChevronUp, ChevronDown, ChevronLeft, ChevronRight
} from 'lucide-react';
import { Pagination } from '../ui/Pagination';
import { CreateOrderModal } from './CreateOrderModal';
import { PublicOrderView } from '../public/PublicOrderView';
import { OrderTimeline } from '../shared/OrderTimeline';
import { createPortal } from 'react-dom';
import { DataService } from '../../services/dataService';
import { useOrderExport } from '../../hooks/useOrderExport';



interface AdminDashboardProps {
  orders: ServiceOrder[];
  techs: User[];
  customers: Customer[];
  startDate: string;
  endDate: string;
  onDateChange: (start: string, end: string) => void;
  onUpdateOrders: () => Promise<void>;
  onEditOrder: (order: ServiceOrder) => Promise<void>;
  onCreateOrder: (order: Partial<ServiceOrder>) => Promise<void>;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  orders, techs, customers, startDate, endDate, onDateChange, onUpdateOrders, onEditOrder, onCreateOrder
}) => {

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [orderToEdit, setOrderToEdit] = useState<ServiceOrder | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<ServiceOrder | null>(null);
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [isBatchPrinting, setIsBatchPrinting] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'execution' | 'media' | 'audit' | 'costs' | 'history'>('overview');
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const [orderVisits, setOrderVisits] = useState<any[]>([]);
  const [sortConfig, setSortConfig] = useState<{ key: string | null, direction: 'asc' | 'desc' }>({ key: 'createdAt', direction: 'desc' });
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 12;

  const requestSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const getSortIcon = (key: string) => {
    if (sortConfig.key !== key) return <ArrowUpDown size={12} className="ml-2 text-slate-300 opacity-0 group-hover:opacity-100 transition-all" />;
    return sortConfig.direction === 'asc'
      ? <ChevronUp size={14} className="ml-2 text-primary-600 animate-in fade-in zoom-in-50 duration-300" />
      : <ChevronDown size={14} className="ml-2 text-primary-600 animate-in fade-in zoom-in-50 duration-300" />;
  };

  // Hook de Exportação (Refatorado - Big Tech Standard)
  const { handleExportExcel: exportToExcel } = useOrderExport();

  const handleExportExcel = () => {
    exportToExcel({
      orders,
      filteredOrders,
      selectedOrderIds,
      techs
    });
  };

  const handleBatchPrint = () => {
    setIsBatchPrinting(true);
    document.body.classList.add('is-printing');
    // Tempo maior para garantir renderização de imagens e componentes
    setTimeout(() => {
      window.print();
      // Em alguns browsers o print é non-blocking, então usamos listener para garantir
      const cleanup = () => {
        setIsBatchPrinting(false);
        document.body.classList.remove('is-printing');
        window.removeEventListener('afterprint', cleanup);
      };

      // Se for blocking (Chrome/Firefox), isso roda depois do dialog fechar
      // Se for non-blocking (Safari), precisamos do listener
      window.addEventListener('afterprint', cleanup);

      // Fallback para browsers que não disparam afterprint corretamente ou se user cancelar rápido
      setTimeout(cleanup, 5000);
    }, 1500);
  };

  const handlePrintOrder = (orderId: string) => {
    setSelectedOrderIds([orderId]);
    setIsBatchPrinting(true);
    document.body.classList.add('is-printing');
    setTimeout(() => {
      window.print();
      const cleanup = () => {
        setIsBatchPrinting(false);
        document.body.classList.remove('is-printing');
        window.removeEventListener('afterprint', cleanup);
      };
      window.addEventListener('afterprint', cleanup);
      setTimeout(cleanup, 5000);
    }, 1500);
  };

  // States para Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [dateTypeFilter, setDateTypeFilter] = useState<'scheduled' | 'created'>('scheduled');

  const [techFilter, setTechFilter] = useState<string>('ALL');
  const [customerFilter, setCustomerFilter] = useState<string>('ALL');
  const [availableCustomerList, setAvailableCustomerList] = useState<string[]>([]);

  useEffect(() => {
    const uniqueCustomers = Array.from(new Set(orders.map(o => o.customerName))).sort();
    setAvailableCustomerList(uniqueCustomers);
  }, [orders]);

  // Reset page on filter change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, techFilter, customerFilter, startDate, endDate, dateTypeFilter]);

  useEffect(() => {
    if (selectedOrder) {
      import('../../services/orderService').then(mod => {
        mod.OrderService.getOrderVisits(selectedOrder.id).then(visits => {
          setOrderVisits(visits);
        });
      });
    } else {
      setOrderVisits([]);
    }
  }, [selectedOrder]);


  const handleOpenPublicView = (order: ServiceOrder, e: React.MouseEvent) => {
    e.stopPropagation();
    const publicUrl = `${window.location.origin}/#/view/${order.publicToken || order.id}`;
    console.log('[AdminDashboard] Abrindo viewer público:', publicUrl);
    window.open(publicUrl, '_blank');
  };

  const handleCancelOrder = async (order: ServiceOrder, e: React.MouseEvent) => {
    e.stopPropagation();
    if (order.status === OrderStatus.CANCELED) return;
    if (!confirm('Tem certeza que deseja cancelar esta Ordem de Serviço? Esta ação bloqueará edições futuras.')) return;

    await onEditOrder({ ...order, status: OrderStatus.CANCELED });
  };

  const formatDateDisplay = (dateStr: string) => {
    if (!dateStr) return '---';
    const date = new Date(dateStr + 'T12:00:00');
    return date.toLocaleDateString('pt-BR');
  };

  const filteredOrders = useMemo(() => {
    const filtered = orders.filter(order => {
      const term = searchTerm.toLowerCase();
      const matchesSearch = (order.title || '').toLowerCase().includes(term) ||
        (order.customerName || '').toLowerCase().includes(term) ||
        (order.id || '').toLowerCase().includes(term) ||
        (order.displayId || '').toLowerCase().includes(term);

      const matchesStatus = statusFilter === 'ALL' || order.status === statusFilter;

      const assignedTech = techs.find(t => t.id === order.assignedTo);
      const techName = assignedTech ? assignedTech.name.toLowerCase() : '';
      const matchesTech = techFilter === 'ALL' || techName.includes(techFilter.toLowerCase());

      const matchesCustomer = customerFilter === 'ALL' || order.customerName.toLowerCase().includes(customerFilter.toLowerCase());

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

    if (sortConfig.key) {
      filtered.sort((a, b) => {
        let aValue: any = (a as any)[sortConfig.key!];
        let bValue: any = (b as any)[sortConfig.key!];

        // Tratamento especial para nomes de técnicos
        if (sortConfig.key === 'assignedTo') {
          aValue = techs.find(t => t.id === a.assignedTo)?.name || '';
          bValue = techs.find(t => t.id === b.assignedTo)?.name || '';
        }

        // Tratamento para nomes de clientes (evitar IDs se possível)
        if (sortConfig.key === 'customerName') {
          const custA = customers.find(c => c.name === a.customerName || c.document === a.customerName)?.name || a.customerName;
          const custB = customers.find(c => c.name === b.customerName || c.document === b.customerName)?.name || b.customerName;
          aValue = custA;
          bValue = custB;
        }

        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return filtered;
  }, [orders, techs, customers, searchTerm, statusFilter, startDate, endDate, techFilter, customerFilter, dateTypeFilter, sortConfig]);

  const paginatedOrders = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredOrders.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredOrders, currentPage]);

  const totalPages = Math.ceil(filteredOrders.length / ITEMS_PER_PAGE);

  const toggleSelection = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedOrderIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedOrderIds.length === filteredOrders.length) {
      setSelectedOrderIds([]);
    } else {
      setSelectedOrderIds(filteredOrders.map(o => o.id));
    }
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
    <div className="p-4 animate-fade-in flex flex-col h-full bg-slate-50 overflow-hidden">
      {/* Search & Filter Toolbar */}
      <div className="mb-6 space-y-4">
        {/* Row 1: Search & Date Filters */}
        <div className="flex flex-col xl:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder="Pesquisar por protocolo, cliente ou descrição..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full h-10 bg-white border border-slate-200 rounded-md pl-10 pr-4 text-sm font-medium text-slate-700 placeholder-slate-400 outline-none focus:ring-4 focus:ring-slate-500/5 focus:border-slate-400 transition-all"
            />
          </div>

          <div className="flex items-center gap-2 bg-white border border-slate-200 p-1 rounded-md shadow-sm">
            <div className="flex items-center px-3 py-1.5 border-r border-slate-100">
              <select
                value={dateTypeFilter}
                onChange={(e) => setDateTypeFilter(e.target.value as 'scheduled' | 'created')}
                className="bg-transparent text-xs font-semibold text-slate-600 outline-none cursor-pointer"
              >
                <option value="scheduled">Agendamento</option>
                <option value="created">Abertura</option>
              </select>
            </div>
            <div className="flex items-center gap-2 px-2">
              <input type="date" value={startDate} onChange={e => onDateChange(e.target.value, endDate)} className="bg-transparent border-none text-xs font-medium text-slate-600 outline-none focus:text-slate-900" />
              <span className="text-xs text-slate-300 font-medium">até</span>
              <input type="date" value={endDate} onChange={e => onDateChange(startDate, e.target.value)} className="bg-transparent border-none text-xs font-medium text-slate-600 outline-none focus:text-slate-900" />
            </div>
          </div>
        </div>

        {/* Row 2: Secondary Filters & Actions */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center bg-white border border-slate-200 rounded-md pl-3 pr-1 h-10 min-w-[160px] shadow-sm">
            <Filter size={14} className="text-slate-400 mr-2" />
            <select className="bg-transparent text-xs font-semibold text-slate-600 outline-none w-full cursor-pointer h-full" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="ALL">Status: Todos</option>
              {Object.values(OrderStatus).map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div className="flex items-center bg-white border border-slate-200 rounded-md pl-3 pr-1 h-10 min-w-[160px] shadow-sm">
            <UserCheck size={14} className="text-slate-400 mr-2" />
            <select className="bg-transparent text-xs font-semibold text-slate-600 outline-none w-full cursor-pointer h-full" value={techFilter} onChange={e => setTechFilter(e.target.value)}>
              <option value="ALL">Técnico: Todos</option>
              {techs.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
            </select>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearchTerm(''); setStatusFilter('ALL'); setTechFilter('ALL'); setCustomerFilter('ALL'); setDateTypeFilter('scheduled');
              onDateChange('', '');
              setSelectedOrderIds([]);
            }}
            className="h-10 px-4 text-xs font-bold text-slate-500 hover:text-slate-700"
          >
            Limpar Filtros
          </Button>

          <div className="flex items-center gap-3 ml-auto">
            {/* Exportação Geral (Baseada em Filtros) */}
            {selectedOrderIds.length === 0 && (
              <div className="flex items-center gap-2 mr-2">
                <button
                  onClick={handleExportExcel}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl text-[10px] font-black uppercase hover:bg-emerald-600 hover:text-white transition-all shadow-sm border border-emerald-100/50"
                  title="Exportar Filtrados para Excel"
                >
                  <FileSpreadsheet size={14} /> Exportar Excel
                </button>
              </div>
            )}

            {/* Ações em Lote (Seleção) */}
            {selectedOrderIds.length > 0 && (
              <div className="flex items-center gap-3 px-4 py-1.5 bg-slate-900 rounded-[1.5rem] shadow-2xl animate-in fade-in slide-in-from-right-4 ring-4 ring-slate-100">
                <div className="flex flex-col pr-3 border-r border-slate-700">
                  <span className="text-[9px] font-black text-slate-400 uppercase leading-none mb-0.5">Selecionados</span>
                  <span className="text-xs font-black text-white leading-none">{selectedOrderIds.length}</span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleExportExcel}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-white rounded-xl text-[10px] font-black uppercase transition-all shadow-lg shadow-emerald-500/20 active:scale-95"
                    title="Exportar Seleção para Excel"
                  >
                    <FileSpreadsheet size={14} /> Excel
                  </button>

                  <button
                    onClick={handleBatchPrint}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-[10px] font-black uppercase transition-all shadow-lg shadow-slate-500/20 active:scale-95"
                    title="Gerar PDF / Imprimir Seleção"
                  >
                    <FileText size={14} /> Exportar PDF
                  </button>

                  <div className="w-px h-6 bg-slate-700 mx-1" />

                  <button
                    onClick={() => setSelectedOrderIds([])}
                    className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 rounded-xl transition-all"
                    title="Limpar Seleção"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>
            )}

            <Button
              variant="primary"
              className="h-10 px-6 gap-2 bg-primary-600 hover:bg-primary-700 shadow-xl shadow-primary-500/20"
              onClick={() => { setOrderToEdit(null); setIsCreateModalOpen(true); }}
            >
              <Plus size={16} /> Novo Atendimento
            </Button>
          </div>
        </div>
      </div>

      {/* Main Table Container - Premium Look */}
      <div className="bg-white border border-slate-200/60 rounded-xl shadow-sm flex flex-col overflow-hidden flex-1 ring-1 ring-slate-100">
        <div className="flex-1 overflow-auto custom-scrollbar">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 z-10 shadow-sm">
              <tr className="text-[11px] font-bold text-slate-500 uppercase tracking-wider text-left">
                <th className="px-6 py-1.5 w-12 text-center text-slate-400">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                    checked={filteredOrders.length > 0 && selectedOrderIds.length === filteredOrders.length}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th className="px-6 py-1.5 cursor-pointer group hover:text-primary-600 transition-colors" onClick={() => requestSort('id')}>
                  <div className="flex items-center gap-1">Protocolo {getSortIcon('displayId')}</div>
                </th>
                <th className="px-6 py-1.5 cursor-pointer group hover:text-primary-600 transition-colors" onClick={() => requestSort('scheduledDate')}>
                  <div className="flex items-center gap-1">Agendamento {getSortIcon('scheduledDate')}</div>
                </th>
                <th className="px-6 py-1.5 cursor-pointer group hover:text-primary-600 transition-colors" onClick={() => requestSort('createdAt')}>
                  <div className="flex items-center gap-1">Abertura {getSortIcon('createdAt')}</div>
                </th>
                <th className="px-6 py-1.5 cursor-pointer group hover:text-primary-600 transition-colors" onClick={() => requestSort('customerName')}>
                  <div className="flex items-center gap-1">Cliente {getSortIcon('customerName')}</div>
                </th>
                <th className="px-6 py-1.5 text-center cursor-pointer group hover:text-primary-600 transition-colors" onClick={() => requestSort('assignedTo')}>
                  <div className="flex items-center justify-center gap-1">Técnico {getSortIcon('assignedTo')}</div>
                </th>
                <th className="px-6 py-1.5 cursor-pointer group hover:text-primary-600 transition-colors" onClick={() => requestSort('status')}>
                  <div className="flex items-center gap-1">Status {getSortIcon('status')}</div>
                </th>
                <th className="px-6 py-1.5 text-right pr-8">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {paginatedOrders.length > 0 ? paginatedOrders.map(order => {
                const isSelected = selectedOrderIds.includes(order.id);
                const assignedTech = techs.find(t => t.id === order.assignedTo);
                return (
                  <tr
                    key={order.id}
                    className={`transition-all border-b border-slate-100 hover:border-slate-200 group cursor-pointer ${isSelected ? 'bg-indigo-50/40' : 'bg-white hover:bg-slate-50'}`}
                    onClick={() => setSelectedOrder(order)}
                  >
                    <td className="px-6 py-2 text-center shrink-0 w-12" onClick={(e) => toggleSelection(order.id, e)}>
                      <input
                        type="checkbox"
                        className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                        checked={isSelected}
                        readOnly
                      />
                    </td>
                    <td className="px-6 py-2">
                      <span className="font-bold text-slate-700 text-xs bg-slate-100 px-2 py-1 rounded-md border border-slate-200 group-hover:bg-white group-hover:border-slate-300 transition-colors">
                        {order.displayId || order.id}
                      </span>
                    </td>
                    <td className="px-6 py-2 text-sm font-semibold text-slate-700 whitespace-nowrap">
                      {formatDateDisplay(order.scheduledDate)}
                    </td>
                    <td className="px-6 py-2 text-xs text-slate-500 font-medium uppercase tracking-wide whitespace-nowrap">
                      {order.createdAt ? new Date(order.createdAt).toLocaleDateString('pt-BR') : '---'}
                    </td>
                    <td className="px-6 py-2 font-bold text-sm text-slate-800 tracking-tight truncate max-w-[200px]">
                      {customers.find(c => c.name === order.customerName || c.document === order.customerName)?.name || order.customerName}
                    </td>

                    <td className="px-6 py-2">
                      <div className="flex justify-center">
                        {assignedTech ? (
                          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-50 border border-slate-200 group-hover:bg-white inset-shadow-sm transition-all shrink-0">
                            <img src={assignedTech.avatar} className="w-5 h-5 rounded-full object-cover shadow-sm" />
                            <span className="text-[10px] font-bold text-slate-600 uppercase truncate max-w-[80px]">{assignedTech?.name?.split(' ')[0]}</span>
                          </div>
                        ) : <span className="text-[10px] text-slate-300 font-bold uppercase tracking-widest">-</span>}
                      </div>
                    </td>
                    <td className="px-6 py-2 whitespace-nowrap"><StatusBadge status={order.status} /></td>
                    <td className="px-6 py-2 text-right pr-6">
                      <div className="flex items-center justify-end gap-2 transition-opacity opacity-90 group-hover:opacity-100">
                        <button
                          onClick={(e) => handleOpenPublicView(order, e)}
                          className="p-2 text-primary-600 bg-primary-50 hover:bg-primary-600 hover:text-white rounded-lg border border-primary-200 hover:border-primary-600 transition-all shadow-sm"
                          title="Compartilhar Link Público"
                        >
                          <Share2 size={16} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setOrderToEdit(order); setIsCreateModalOpen(true); }}
                          disabled={order.status === OrderStatus.CANCELED}
                          className="p-2 text-slate-600 bg-white hover:bg-emerald-500 hover:text-white rounded-lg border border-slate-200 hover:border-emerald-500 transition-all shadow-sm disabled:opacity-30 disabled:hover:bg-white disabled:hover:text-slate-600"
                          title="Editar"
                        >
                          <Edit3 size={16} />
                        </button>
                        <button
                          onClick={(e) => handleCancelOrder(order, e)}
                          disabled={order.status === OrderStatus.CANCELED}
                          className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg border border-transparent hover:border-rose-200 transition-all disabled:opacity-0"
                          title="Cancelar"
                        >
                          <Ban size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan={8} className="py-32 text-center bg-slate-50/30">
                    <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-200 shadow-sm">
                      <Search size={24} className="text-slate-300" />
                    </div>
                    <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">Nenhuma atividade localizada</p>
                    <p className="text-xs text-slate-400 font-medium mt-1">Ajuste os filtros para encontrar o que procura</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={filteredOrders.length}
          itemsPerPage={ITEMS_PER_PAGE}
          onPageChange={setCurrentPage}
        />
      </div>

      {isCreateModalOpen && (
        <CreateOrderModal
          onClose={() => setIsCreateModalOpen(false)}
          initialData={orderToEdit || undefined}
          onSubmit={async (data) => {
            if (orderToEdit) await onEditOrder({ ...orderToEdit, ...data } as ServiceOrder);
            else await onCreateOrder(data);
          }}
        />
      )}

      {selectedOrder && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white rounded-xl w-full max-w-6xl max-h-[92vh] shadow-2xl flex flex-col overflow-hidden border border-slate-200">

            {/* HEADER - SaaS Style */}
            <div className="px-6 py-5 border-b border-slate-100 bg-white flex justify-between items-center shrink-0">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-slate-50 rounded-lg flex items-center justify-center text-slate-400 border border-slate-200">
                  <FileText size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="text-base font-bold text-slate-900">Ordem de Serviço #{selectedOrder.displayId || selectedOrder.id}</h2>
                    <StatusBadge status={selectedOrder.status} />
                  </div>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    {selectedOrder.customerName} • {selectedOrder.customerAddress}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handlePrintOrder(selectedOrder.id)}
                  className="h-9 px-4 gap-2"
                >
                  <Printer size={14} /> Imprimir PDF
                </Button>
                <div className="h-6 w-px bg-slate-200 mx-2"></div>
                <button onClick={() => setSelectedOrder(null)} className="p-2 text-slate-400 hover:text-slate-900 transition-all">
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* TABS - Modern SaaS Style */}
            <div className="px-6 border-b border-slate-100 bg-white flex gap-6 shrink-0 overflow-x-auto">
              {[
                { id: 'overview', label: 'Visão Geral', icon: LayoutDashboard },
                { id: 'execution', label: 'Checklist', icon: ClipboardList },
                { id: 'media', label: 'Galeria', icon: Camera },
                { id: 'costs', label: 'Peças e Custos', icon: DollarSign },
                { id: 'history', label: 'Histórico', icon: Clock },
                { id: 'audit', label: 'Assinaturas', icon: ShieldCheck }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-2 py-4 text-xs font-semibold border-b-2 transition-all whitespace-nowrap ${activeTab === tab.id ? 'border-primary-500 text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                >
                  <tab.icon size={15} /> {tab.label}
                </button>
              ))}
            </div>

            {/* CONTENT AREA */}
            <div className="flex-1 overflow-y-auto p-8 bg-slate-50/50 custom-scrollbar">

              {/* TAB: VISÃO GERAL */}
              {activeTab === 'overview' && (
                <div className="grid grid-cols-12 gap-8">
                  {/* Left Column: Details */}
                  <div className="col-span-12 lg:col-span-8 space-y-6">
                    {/* Info Card Grid */}
                    <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
                      <h3 className="text-sm font-bold text-slate-900 mb-6 flex items-center gap-2">
                        <UserIcon size={18} className="text-slate-400" /> Informações do Cliente
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-y-6 gap-x-12">
                        <div className="space-y-1">
                          <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Cliente / Razão Social</label>
                          <div className="text-sm font-semibold text-slate-900">{selectedOrder.customerName}</div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Endereço de Atendimento</label>
                          <div className="text-sm text-slate-600 font-medium leading-relaxed">{selectedOrder.customerAddress || 'Não informado'}</div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Contato Principal</label>
                          <div className="text-sm text-slate-600 font-medium">Não informado</div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Documento</label>
                          <div className="text-sm text-slate-600 font-medium font-mono text-xs">Não informado</div>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
                      <h3 className="text-sm font-bold text-slate-900 mb-6 flex items-center gap-2">
                        <FileText size={18} className="text-slate-400" /> Relatório de Atendimento
                      </h3>
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Descrição das Atividades</label>
                          <div className="p-4 bg-slate-50/50 rounded-md border border-slate-100 text-sm text-slate-700 leading-relaxed whitespace-pre-wrap min-h-[120px] font-medium">
                            {selectedOrder.description || "Nenhuma observação técnica registrada."}
                          </div>
                        </div>
                        {selectedOrder.notes && (
                          <div className="p-4 bg-primary-50 border border-primary-100 rounded-md">
                            <label className="text-[11px] font-bold text-[#1c2d4f] uppercase tracking-wider flex items-center gap-2 mb-2">
                              <ShieldCheck size={14} /> Notas de Encerramento
                            </label>
                            <p className="text-sm font-medium text-slate-700 leading-relaxed">{selectedOrder.notes}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Metadata */}
                  <div className="col-span-12 lg:col-span-4 space-y-6">
                    {/* Dates Card */}
                    <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
                      <h3 className="text-xs font-bold text-slate-900 uppercase tracking-tight mb-4 flex items-center gap-2"><Clock size={16} className="text-slate-400" /> Cronograma</h3>
                      <div className="space-y-4">
                        <div className="flex justify-between items-center pb-3 border-b border-slate-50">
                          <span className="text-xs font-semibold text-slate-400">Abertura</span>
                          <span className="text-xs font-bold text-slate-700">{new Date(selectedOrder.createdAt).toLocaleDateString()}</span>
                        </div>
                        <div className="flex justify-between items-center pb-3 border-b border-slate-50">
                          <span className="text-xs font-semibold text-slate-400">Agendamento</span>
                          <span className="text-xs font-bold text-[#1c2d4f]">{formatDateDisplay(selectedOrder.scheduledDate)} - {selectedOrder.scheduledTime || '--:--'}</span>
                        </div>
                        <div className="p-3 bg-emerald-50 rounded-md border border-emerald-100">
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-[10px] font-bold text-emerald-600 uppercase">Execução</span>
                          </div>
                          <div className="space-y-1">
                            <div className="flex justify-between text-[11px] font-medium text-emerald-800">
                              <span>Início</span>
                              <span>{selectedOrder.startDate ? new Date(selectedOrder.startDate).toLocaleString([], { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '--/--'}</span>
                            </div>
                            <div className="flex justify-between text-[11px] font-medium text-emerald-800">
                              <span>Término</span>
                              <span>{selectedOrder.endDate ? new Date(selectedOrder.endDate).toLocaleString([], { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '--/--'}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Tech Card */}
                    <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
                      <h3 className="text-xs font-bold text-slate-900 uppercase tracking-tight mb-4 flex items-center gap-2"><UserCheck size={16} className="text-slate-400" /> Recursos</h3>
                      {(() => {
                        const tech = techs.find(t => t.id === selectedOrder.assignedTo);
                        return tech ? (
                          <div className="flex items-center gap-4">
                            <img src={tech.avatar} className="w-12 h-12 rounded-full border border-slate-100 object-cover" />
                            <div>
                              <div className="text-sm font-bold text-slate-900">{tech.name}</div>
                              <div className="text-xs font-medium text-slate-500">Técnico de Campo</div>
                            </div>
                          </div>
                        ) : <span className="text-xs text-slate-400 font-medium">Nenhum técnico atribuído</span>;
                      })()}
                    </div>

                    {/* Asset Card */}
                    <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
                      <h3 className="text-xs font-bold text-slate-900 uppercase tracking-tight mb-4 flex items-center gap-2"><Box size={16} className="text-slate-400" /> Ativo Vinculado</h3>
                      <div className="space-y-3">
                        <div className="text-sm font-bold text-slate-900">{selectedOrder.equipmentName || 'Sem Patrimônio'}</div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <span className="block text-[10px] font-bold text-slate-400 uppercase">Modelo</span>
                            <span className="text-xs font-semibold text-slate-700">{selectedOrder.equipmentModel || '-'}</span>
                          </div>
                          <div className="space-y-1">
                            <span className="block text-[10px] font-bold text-slate-400 uppercase">Série</span>
                            <span className="text-xs font-semibold text-slate-700 font-mono">{selectedOrder.equipmentSerial || '-'}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB: EXECUÇÃO (CHECKLIST) */}
              {activeTab === 'execution' && (
                <div className="max-w-4xl mx-auto space-y-6">
                  {selectedOrder.status === 'IMPEDIDO' && (
                    <div className="bg-rose-50 border border-rose-100 rounded-lg p-5 flex items-start gap-4 shadow-sm">
                      <div className="w-10 h-10 bg-white rounded-md flex items-center justify-center border border-rose-200 text-rose-600 shrink-0">
                        <AlertTriangle size={20} />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-rose-900">Serviço Impedido</h4>
                        <p className="text-xs text-rose-700 mt-1 font-medium leading-relaxed">{selectedOrder.formData?.impediment_reason || selectedOrder.notes?.replace('IMPEDIMENTO: ', '') || 'Motivo não detalhado pelo técnico.'}</p>
                      </div>
                    </div>
                  )}

                  {/* Agrupar e Renderizar os Checklists de Todas as Visitas */}
                  {(() => {
                    const validVisits = orderVisits
                      .filter(v => ['completed', 'paused'].includes(v.status) && v.formData && Object.keys(v.formData).length > 0)
                      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

                    if (validVisits.length > 0) {
                      return validVisits.map((visit, index) => {
                        const vFormData = visit.formData || {};
                        return (
                          <div key={visit.id || index} className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden mb-6">
                            <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
                              <div>
                                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                                  Visita concluída em {new Date(visit.updatedAt || visit.createdAt).toLocaleString()}
                                </h3>
                                <p className="text-[10px] text-slate-500 font-medium">Status da Visita: {visit.status}</p>
                              </div>
                              <span className="px-2 py-0.5 bg-white border border-slate-200 text-[10px] font-bold text-slate-500 rounded uppercase">
                                {Object.keys(vFormData).length} Itens
                              </span>
                            </div>
                            <div className="divide-y divide-slate-50">
                              {Object.entries(vFormData).filter(([key, val]) => {
                                if (Array.isArray(val)) return false;
                                if (typeof val === 'string' && (val.startsWith('http') || val.startsWith('data:image'))) return false;
                                if (key.includes('Assinatura') || key.includes('impediment')) return false;
                                if (['signature', 'signatureName', 'signatureDoc', 'finishedAt'].includes(key)) return false;
                                return true;
                              }).map(([key, val]) => (
                                <div key={key} className="px-6 py-4 flex justify-between gap-6 hover:bg-slate-50/50 transition-colors items-center">
                                  <div className="text-[13px] font-medium text-slate-600">{key}</div>
                                  <div className={`text-[11px] font-bold uppercase px-2.5 py-1 rounded-md border min-w-[60px] text-center ${String(val).toLowerCase() === 'ok' || String(val).toLowerCase() === 'sim' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                                    {String(val)}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      });
                    }

                    if (selectedOrder.formData && Object.keys(selectedOrder.formData).length > 0) {
                      return (
                        <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden mb-6">
                          <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
                            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Lista de Verificação (OS)</h3>
                            <span className="px-2 py-0.5 bg-white border border-slate-200 text-[10px] font-bold text-slate-500 rounded uppercase">
                              {Object.keys(selectedOrder.formData || {}).length} Itens
                            </span>
                          </div>
                          <div className="divide-y divide-slate-50">
                            {Object.entries(selectedOrder.formData).filter(([key, val]) => {
                              if (Array.isArray(val)) return false;
                              if (typeof val === 'string' && (val.startsWith('http') || val.startsWith('data:image'))) return false;
                              if (key.includes('Assinatura') || key.includes('impediment')) return false;
                              if (['signature', 'signatureName', 'signatureDoc', 'finishedAt', 'technical_report', 'parts_used'].includes(key)) return false;
                              return true;
                            }).map(([key, val]) => (
                              <div key={key} className="px-6 py-4 flex justify-between gap-6 hover:bg-slate-50/50 transition-colors items-center">
                                <div className="text-[13px] font-medium text-slate-600">{key}</div>
                                <div className={`text-[11px] font-bold uppercase px-2.5 py-1 rounded-md border min-w-[60px] text-center ${String(val).toLowerCase() === 'ok' || String(val).toLowerCase() === 'sim' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                                  {String(val)}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div className="p-20 text-center bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden mb-6">
                        <ClipboardList className="w-12 h-12 text-slate-100 mx-auto mb-4" />
                        <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Aguardando preenchimento do checklist</p>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* TAB: MÍDIAS */}
              {activeTab === 'media' && (
                <div className="space-y-8">
                  {/* Combina fotos da OS e das visitas concluídas/pausadas */}
                  {(() => {
                    const allForms: any[] = [];
                    if (selectedOrder.formData && Object.keys(selectedOrder.formData).length > 0) {
                      allForms.push(selectedOrder.formData);
                    }
                    orderVisits.filter(v => ['completed', 'paused'].includes(v.status) && v.formData).forEach(v => allForms.push(v.formData));

                    const extractedPhotos: { key: string, url: string }[] = [];
                    allForms.forEach(form => {
                      Object.entries(form).forEach(([key, val]) => {
                        if (Array.isArray(val)) val.forEach(url => { if (typeof url === 'string' && (url.startsWith('http') || url.startsWith('data:image'))) extractedPhotos.push({ key, url }) });
                        else if (typeof val === 'string' && (val.startsWith('http') || val.startsWith('data:image')) && !key.toLowerCase().includes('assinat') && !key.toLowerCase().includes('sign')) {
                          extractedPhotos.push({ key, url: val });
                        }
                      });
                    });

                    const groupedPhotos = extractedPhotos.reduce((acc, curr) => {
                      if (!acc[curr.key]) acc[curr.key] = [];
                      // Avoid exact duplicates
                      if (!acc[curr.key].includes(curr.url)) {
                        acc[curr.key].push(curr.url);
                      }
                      return acc;
                    }, {} as Record<string, string[]>);

                    const groupKeys = Object.keys(groupedPhotos);

                    if (groupKeys.length === 0) {
                      return (
                        <div className="py-20 text-center bg-white border border-slate-200 rounded-lg">
                          <Camera className="w-12 h-12 text-slate-100 mx-auto mb-4" />
                          <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Nenhuma evidência fotográfica registrada</p>
                        </div>
                      );
                    }

                    return groupKeys.map(key => (
                      <div key={key} className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
                        <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-6 pb-2 border-b border-slate-100 flex items-center gap-2">
                          <Camera size={16} className="text-slate-400" /> {key}
                        </h4>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-4">
                          {groupedPhotos[key].map((p, i) => (
                            <div
                              key={i}
                              className="aspect-[4/3] bg-slate-50 rounded-md border border-slate-200 overflow-hidden cursor-zoom-in relative group transition-all hover:border-primary-400"
                              onClick={() => setFullscreenImage(p)}
                            >
                              <img src={p} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                              <div className="absolute inset-0 bg-slate-900/0 group-hover:bg-slate-900/10 transition-colors" />
                            </div>
                          ))}
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              )}

              {/* TAB: CUSTOS */}
              {activeTab === 'costs' && (
                <div className="max-w-5xl mx-auto space-y-6">
                  <div className="flex justify-between items-center bg-[#1c2d4f] p-8 rounded-lg shadow-lg text-white">
                    <div>
                      <h3 className="text-base font-bold text-white mb-1">Mão de Obra e Peças</h3>
                      <p className="text-xs text-white/60 font-medium">Consolidação financeira de insumos e atividades</p>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1">Total Consolidado</div>
                      <div className="text-3xl font-bold font-mono">
                        R$ {(selectedOrder.items?.reduce((acc, i) => acc + i.total, 0) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
                    <table className="w-full text-left">
                      <thead className="bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100">
                        <tr>
                          <th className="px-6 py-1.5">Item / Serviço</th>
                          <th className="px-4 py-1.5 text-center">Procedência</th>
                          <th className="px-4 py-1.5 text-center">Quant.</th>
                          <th className="px-4 py-1.5 text-right">Unitário</th>
                          <th className="px-6 py-1.5 text-right">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50 text-sm">
                        {selectedOrder.items?.map(item => (
                          <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-6 py-1.5 font-semibold text-slate-800">{item.description}</td>
                            <td className="px-4 py-1.5 text-center">
                              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase border ${item.fromStock ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                                {item.fromStock ? 'Estoque' : 'Avulso'}
                              </span>
                            </td>
                            <td className="px-4 py-1.5 text-center text-slate-600 font-medium">{item.quantity}</td>
                            <td className="px-4 py-1.5 text-right font-mono text-slate-500 text-xs">R$ {item.unitPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                            <td className="px-6 py-1.5 text-right font-mono font-bold text-slate-900">R$ {item.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                          </tr>
                        ))}
                        {(!selectedOrder.items || selectedOrder.items.length === 0) && (
                          <tr><td colSpan={5} className="py-20 text-center text-slate-300 font-bold uppercase tracking-widest text-xs">Nenhum custo registrado para esta O.S.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* TAB: AUDITORIA */}
              {activeTab === 'audit' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="bg-white p-10 rounded-lg border border-slate-200 shadow-sm flex flex-col items-center text-center">
                    <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center border border-slate-100 mb-6 group hover:border-[#1c2d4f] transition-all">
                      <ShieldCheck size={32} className="text-slate-300 group-hover:text-[#1c2d4f]" />
                    </div>
                    <h3 className="text-sm font-bold text-slate-900 uppercase tracking-tight">Validação Técnica</h3>
                    <p className="text-xs text-slate-500 mt-2 mb-8 font-medium">Revisado e assinado eletronicamente pelo responsável de campo</p>
                    <div className="w-full pt-8 border-t border-slate-100">
                      <div className="text-base font-bold text-slate-800">{techs.find(t => t.id === selectedOrder.assignedTo)?.name || 'Técnico Não Identificado'}</div>
                      <div className="text-[10px] text-slate-400 font-mono mt-2 break-all bg-slate-50 p-2 rounded border border-slate-100 select-all">
                        {selectedOrder.displayId || selectedOrder.id}-VALID-{new Date(selectedOrder.createdAt).getTime()}
                      </div>
                    </div>
                  </div>

                  <div className="bg-white p-10 rounded-lg border border-slate-200 shadow-sm flex flex-col items-center text-center">
                    <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center border border-slate-100 mb-6">
                      <UserCheck size={32} className="text-slate-300" />
                    </div>
                    <h3 className="text-sm font-bold text-slate-900 uppercase tracking-tight">Aceite do Cliente</h3>
                    <p className="text-xs text-slate-500 mt-2 mb-8 font-medium">Protocolo de recebimento e satisfação de serviço</p>

                    {(() => {
                      const data = selectedOrder.formData || {};
                      const signature = data.signature || data['Assinatura do Cliente'] || Object.entries(data).find(([k, v]) => k.toLowerCase().includes('assinat') && typeof v === 'string' && (v.startsWith('data:') || v.startsWith('http')))?.[1];
                      const name = data.signatureName || data['Assinatura do Cliente - Nome'] || selectedOrder.customerName;

                      return signature ? (
                        <div className="w-full">
                          <img src={signature} className="h-28 mx-auto object-contain mix-blend-multiply mb-6" alt="Assinatura" />
                          <div className="pt-6 border-t border-slate-100">
                            <div className="text-base font-bold text-slate-900">{name}</div>
                            <div className="text-[10px] text-emerald-600 font-bold uppercase mt-1">✓ Assinado Digitalmente</div>
                          </div>
                        </div>
                      ) : (
                        <div className="py-8 w-full border-t border-slate-100">
                          <p className="text-xs text-slate-400 font-bold uppercase bg-slate-50 py-4 rounded-md border border-dashed border-slate-200 tracking-widest">Assinatura Pendente</p>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}

              {/* TAB: HISTÓRICO */}
              {activeTab === 'history' && (
                <div className="max-w-4xl mx-auto space-y-8 bg-white p-8 rounded-lg border border-slate-200">
                  <OrderTimeline orderId={selectedOrder.id} />
                </div>
              )}

            </div>
          </div>
        </div>
      )}

      {/* Batch Print Container */}
      {isBatchPrinting && createPortal(
        <div id="batch-print-root" className="bg-white">
          {orders
            .filter(o => selectedOrderIds.includes(o.id))
            .map((order) => (
              <div key={order.id} className="print:break-after-page last:print:break-after-auto w-full">
                <PublicOrderView order={order} techs={techs} isPrint={true} />
              </div>
            ))}
        </div>,
        document.body
      )}

      {/* Lightbox Viewer */}
      {fullscreenImage && (
        <div
          className="fixed inset-0 z-[1000] bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-8 animate-in fade-in"
          onClick={() => setFullscreenImage(null)}
        >
          <div className="relative max-w-5xl w-full h-full flex items-center justify-center">
            <img
              src={fullscreenImage}
              className="max-w-full max-h-full object-contain rounded-lg shadow-2xl animate-in zoom-in-95"
              alt="Visualização"
            />
            <button className="absolute top-0 right-0 p-4 text-white hover:text-slate-300 transition-colors">
              <X size={32} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

