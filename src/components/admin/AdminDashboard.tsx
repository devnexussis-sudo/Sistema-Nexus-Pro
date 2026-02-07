
import React, { useState, useMemo, useEffect } from 'react';
import { ServiceOrder, User, OrderStatus, OrderPriority, Customer } from '../../types';
import { Button } from '../ui/Button';
import { StatusBadge, PriorityBadge } from '../ui/StatusBadge';
import {
  Plus, Printer, X, FileText, CheckCircle2, ShieldCheck,
  Edit3, ExternalLink, Search, Filter, Calendar, Share2,
  Users, UserCheck, Clock, FileSpreadsheet, Download, Camera, ClipboardList, Ban, MapPin, Box,
  DollarSign, Eye, EyeOff
} from 'lucide-react';
import { CreateOrderModal } from './CreateOrderModal';
import { PublicOrderView } from '../public/PublicOrderView';
import { createPortal } from 'react-dom';
import * as XLSX from 'xlsx';



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
  const [activeTab, setActiveTab] = useState<'overview' | 'execution' | 'media' | 'audit' | 'costs'>('overview');
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);

  const handleExportExcel = () => {
    // Se tiver seleção, usa a seleção. Se não, usa o que está filtrado na tela.
    const ordersToExport = selectedOrderIds.length > 0
      ? orders.filter(o => selectedOrderIds.includes(o.id))
      : filteredOrders;

    if (ordersToExport.length === 0) {
      alert("Nenhuma ordem encontrada para exportar.");
      return;
    }

    // 1. Preparar os dados para exportação com colunas solicitadas
    const exportData = ordersToExport.map(o => {
      const itemsValue = o.items?.reduce((acc, i) => acc + i.total, 0) || 0;
      const value = itemsValue || (o.formData as any)?.totalValue || (o.formData as any)?.price || 0;

      return {
        'ID O.S.': o.id,
        'Data Agendada': o.scheduledDate,
        'Cliente': o.customerName,
        'Título': o.title,
        'Descrição': o.description,
        'Técnico': o.assignedTo || 'N/A',
        'Status': o.status,
        'Prioridade': o.priority,
        'Valor Total': value,
        'Status Financeiro': o.billingStatus || 'PENDENTE',
        'Data de Abertura': o.createdAt,
        'Data de Conclusão': o.endDate || 'N/A'
      };
    });

    // 2. Criar a planilha a partir dos dados
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Atividades Nexus");

    // 3. Ajustar largura das colunas
    const wscols = [
      { wch: 15 }, // id
      { wch: 15 }, // date
      { wch: 30 }, // client
      { wch: 30 }, // title
      { wch: 50 }, // desc
      { wch: 20 }, // tech
      { wch: 15 }, // status
      { wch: 12 }, // priority
      { wch: 15 }, // value
      { wch: 15 }, // billing
      { wch: 20 }, // created
      { wch: 20 }, // closed
    ];
    worksheet['!cols'] = wscols;

    // 4. Gerar arquivo e disparar download
    try {
      XLSX.writeFile(workbook, `atividades_nexus_${new Date().toISOString().split('T')[0]}.xlsx`);
      console.log("✅ Exportação finalizada.");
    } catch (err) {
      console.error("❌ Falha na exportação:", err);
      alert("Erro ao gerar o arquivo Excel.");
    }
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


  const handleOpenPublicView = (order: ServiceOrder, e: React.MouseEvent) => {
    e.stopPropagation();
    const publicUrl = `${window.location.origin}${window.location.pathname}#/view/${order.publicToken || order.id}`;
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
    return orders.filter(order => {
      const term = searchTerm.toLowerCase();
      const matchesSearch = (order.title || '').toLowerCase().includes(term) ||
        (order.customerName || '').toLowerCase().includes(term) ||
        (order.id || '').toLowerCase().includes(term);

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
  }, [orders, techs, searchTerm, statusFilter, startDate, endDate, techFilter, customerFilter, dateTypeFilter]);

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
    <div className="p-4 animate-fade-in flex flex-col h-full bg-slate-50/20 overflow-hidden">
      {/* Toolbar (Moved Outside) */}
      {/* Toolbar (Moved Outside) */}
      <div className="mb-2 space-y-2">
        {/* Row 1: Search & Date Filters */}
        <div className="flex flex-col xl:flex-row gap-2">
          {/* Search Input (Grow) */}
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder="Pesquisar protocolo, cliente ou descrição..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl pl-12 pr-4 py-3 text-[11px] font-bold text-slate-700 outline-none focus:ring-4 focus:ring-indigo-100 transition-all shadow-sm h-full"
            />
          </div>

          {/* Date Control Group */}
          <div className="flex flex-wrap xl:flex-nowrap items-center gap-2 bg-white border border-slate-200 p-1.5 rounded-xl shadow-sm">

            {/* Date Type Selector */}
            <div className="flex items-center bg-slate-50 rounded-lg px-2 py-1 h-full">
              <select
                value={dateTypeFilter}
                onChange={(e) => setDateTypeFilter(e.target.value as 'scheduled' | 'created')}
                className="bg-transparent text-[9px] font-black uppercase text-indigo-700 outline-none cursor-pointer"
              >
                <option value="scheduled">Dt. Agendamento</option>
                <option value="created">Dt. Abertura</option>
              </select>
            </div>

            <div className="h-4 w-[1px] bg-slate-200 mx-1"></div>

            {/* Date Inputs */}
            <div className="flex items-center gap-2">
              <input type="date" value={startDate} onChange={e => onDateChange(e.target.value, endDate)} className="bg-transparent border-none text-[10px] font-black uppercase text-slate-600 outline-none hover:text-indigo-600 transition-colors cursor-pointer" />
              <span className="text-[9px] font-black text-slate-300">até</span>
              <input type="date" value={endDate} onChange={e => onDateChange(startDate, e.target.value)} className="bg-transparent border-none text-[10px] font-black uppercase text-slate-600 outline-none hover:text-indigo-600 transition-colors cursor-pointer" />
            </div>

            <div className="h-4 w-[1px] bg-slate-200 mx-1"></div>

            {/* Fast Filters */}
            <div className="flex gap-1">
              {['today', 'week', 'month'].map((f) => (
                <button
                  key={f}
                  onClick={() => handleFastFilter(f as any)}
                  className="px-3 py-1.5 text-[8px] font-black uppercase rounded-lg transition-all text-slate-400 hover:text-indigo-600 hover:bg-slate-50 active:scale-95"
                >{f === 'today' ? 'Hoje' : f === 'week' ? 'Semana' : 'Mês'}</button>
              ))}
            </div>
          </div>
        </div>

        {/* Row 2: Secondary Filters & Actions */}
        <div className="flex flex-wrap items-center gap-2">

          {/* Status Filter */}
          <div className="flex items-center bg-white border border-slate-200 rounded-xl p-1 px-3 shadow-sm h-10 min-w-[140px]">
            <Filter size={14} className="text-slate-400 mr-2" />
            <select className="bg-transparent text-[10px] font-black uppercase text-slate-600 outline-none w-full cursor-pointer" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="ALL">Todos Status</option>
              {Object.values(OrderStatus).map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* Tech Filter */}
          <div className="flex items-center bg-white border border-slate-200 rounded-xl p-1 px-3 shadow-sm h-10 min-w-[140px]">
            <UserCheck size={14} className="text-slate-400 mr-2" />
            <select className="bg-transparent text-[10px] font-black uppercase text-slate-600 outline-none w-full cursor-pointer" value={techFilter} onChange={e => setTechFilter(e.target.value)}>
              <option value="ALL">Todos Técnicos</option>
              {techs.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
            </select>
          </div>

          {/* Clear Buttons */}
          <button
            onClick={() => {
              setSearchTerm(''); setStatusFilter('ALL'); setTechFilter('ALL'); setCustomerFilter('ALL'); setDateTypeFilter('scheduled');
              onDateChange('', '');
              setSelectedOrderIds([]);
            }}
            className="px-4 h-10 flex items-center justify-center text-[9px] font-black uppercase text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors border border-dashed border-indigo-200"
          >
            Limpar
          </button>

          {/* Action Buttons Integrated into Toolbar */}
          <div className="flex items-center gap-2 ml-auto">
            {selectedOrderIds.length > 0 && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 border border-indigo-200 rounded-xl animate-fade-in shadow-sm mr-2 h-10">
                <span className="text-[9px] font-black text-indigo-700 uppercase italic hidden xl:inline">{selectedOrderIds.length} Sel.</span>
                <button onClick={handleBatchPrint} className="text-indigo-600 hover:text-indigo-800 p-1" title="Imprimir"><Printer size={14} /></button>
                <div className="h-3 w-[1px] bg-indigo-200" />
                <button onClick={handleExportExcel} className="text-emerald-600 hover:text-emerald-800 p-1" title="Excel"><FileSpreadsheet size={14} /></button>
                <button onClick={() => setSelectedOrderIds([])} className="text-indigo-400 hover:text-red-500 p-1"><X size={14} /></button>
              </div>
            )}

            <button
              onClick={() => { setOrderToEdit(null); setIsCreateModalOpen(true); }}
              className="flex items-center gap-2 px-5 h-10 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase italic shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 transition-all active:scale-95"
            >
              <Plus size={14} /> Novo Chamado
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-100 rounded-[2rem] flex flex-col overflow-hidden shadow-2xl shadow-slate-200/40 flex-1 min-h-0">

        {/* Compact Table Space */}
        <div className="flex-1 overflow-auto custom-scrollbar -mt-2">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-slate-50/95 backdrop-blur-sm z-10">
              <tr className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] text-left">
                <th className="px-6 py-5 border-b border-slate-100 text-center w-12">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    checked={filteredOrders.length > 0 && selectedOrderIds.length === filteredOrders.length}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th className="px-4 py-5 border-b border-slate-100">Protocolo</th>
                <th className="px-4 py-5 border-b border-slate-100">Agenda</th>
                <th className="px-4 py-5 border-b border-slate-100">Abertura</th>
                <th className="px-4 py-5 border-b border-slate-100">Cliente</th>
                <th className="px-4 py-5 border-b border-slate-100">Técnico</th>
                <th className="px-4 py-5 border-b border-slate-100">Status</th>
                <th className="px-4 py-5 border-b border-slate-100">Execução</th>
                <th className="px-4 py-5 border-b border-slate-100 text-right pr-10">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.length > 0 ? filteredOrders.map(order => {
                const isSelected = selectedOrderIds.includes(order.id);
                const assignedTech = techs.find(t => t.id === order.assignedTo);
                return (
                  <tr
                    key={order.id}
                    className={`transition-all group cursor-pointer border-b border-slate-50 ${isSelected ? 'bg-indigo-50/50' : 'bg-white hover:bg-slate-50/50'}`}
                    onClick={() => setSelectedOrder(order)}
                  >
                    <td className="px-6 py-5 text-center" onClick={(e) => toggleSelection(order.id, e)}>
                      <input
                        type="checkbox"
                        className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        checked={isSelected}
                        readOnly
                      />
                    </td>
                    <td className="px-4 py-5 font-black text-[11px] whitespace-nowrap">#{order.id}</td>
                    <td className="px-4 py-5 text-[10px] font-black text-indigo-600 uppercase italic">
                      {formatDateDisplay(order.scheduledDate)}
                    </td>
                    <td className="px-4 py-5 text-[10px] font-bold text-slate-500 uppercase italic">
                      {order.createdAt ? new Date(order.createdAt).toLocaleDateString('pt-BR') : '---'}
                    </td>
                    <td className="px-4 py-5 font-bold text-[11px] uppercase text-slate-700 truncate max-w-[200px]">
                      {customers.find(c => c.name === order.customerName || c.document === order.customerName)?.name || order.customerName}
                    </td>

                    <td className="px-4 py-5">
                      {assignedTech ? (
                        <div className="flex items-center gap-2">
                          <img src={assignedTech.avatar} className="w-6 h-6 rounded-lg object-cover border border-slate-100" />
                          <span className="text-[10px] font-black uppercase text-slate-500 italic">{assignedTech?.name?.split(' ')[0] || '---'}</span>
                        </div>
                      ) : <span className="text-[8px] text-slate-300 italic font-black">---</span>}
                    </td>
                    <td className="px-4 py-5"><StatusBadge status={order.status} /></td>
                    <td className="px-4 py-5">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-black text-slate-500 uppercase italic">
                          {order.startDate ? new Date(order.startDate).toLocaleDateString('pt-BR') : '---'}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-5 text-right pr-6">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={(e) => handleOpenPublicView(order, e)}
                          className="p-2.5 bg-white text-slate-400 hover:text-indigo-600 rounded-xl shadow-sm border border-slate-100 hover:border-indigo-100 transition-all"
                          title="Relatório Público"
                        >
                          <Share2 size={14} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setOrderToEdit(order); setIsCreateModalOpen(true); }}
                          disabled={order.status === OrderStatus.CANCELED}
                          className={`p-2.5 bg-white rounded-xl shadow-sm border transition-all ${order.status === OrderStatus.CANCELED ? 'opacity-30 cursor-not-allowed border-slate-100 text-slate-300' : 'text-slate-400 hover:text-indigo-600 border-slate-100 hover:border-indigo-100'}`}
                          title="Editar OS"
                        >
                          <Edit3 size={14} />
                        </button>
                        <button
                          onClick={(e) => handleCancelOrder(order, e)}
                          disabled={order.status === OrderStatus.CANCELED}
                          className={`p-2.5 bg-white rounded-xl shadow-sm border transition-all ${order.status === OrderStatus.CANCELED ? 'opacity-30 cursor-not-allowed border-slate-100 text-slate-300' : 'text-slate-400 hover:text-rose-600 border-slate-100 hover:border-rose-100'}`}
                          title="Cancelar OS"
                        >
                          <Ban size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan={7} className="py-32 text-center">
                    <Clock size={40} className="mx-auto text-slate-100 mb-4" />
                    <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest italic">Nenhuma atividade localizada</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white rounded-xl w-full max-w-6xl max-h-[95vh] shadow-2xl flex flex-col overflow-hidden">

            {/* HEADER - Enterprise Style */}
            <div className="px-6 py-4 border-b border-slate-200 bg-white flex justify-between items-center shrink-0">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center text-white shadow-md">
                  <FileText size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="text-lg font-bold text-slate-900 leading-none">Ordem de Serviço #{selectedOrder.id}</h2>
                    <StatusBadge status={selectedOrder.status} />
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1 uppercase tracking-wider font-semibold">
                    {selectedOrder.customerName} • {selectedOrder.customerAddress}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handlePrintOrder(selectedOrder.id)}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-bold uppercase hover:bg-slate-800 transition-all shadow-sm active:scale-95"
                >
                  <Printer size={14} /> Imprimir PDF
                </button>
                <div className="h-6 w-[1px] bg-slate-200 mx-1"></div>
                <button onClick={() => setSelectedOrder(null)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all">
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* TABS - Underlined Style */}
            <div className="px-6 border-b border-slate-200 bg-slate-50/50 flex gap-6 shrink-0 overflow-x-auto">
              {[
                { id: 'overview', label: 'Visão Geral', icon: LayoutDashboard },
                { id: 'execution', label: 'Execução & Checklist', icon: ClipboardList },
                { id: 'media', label: 'Evidências (Fotos)', icon: Camera },
                { id: 'costs', label: 'Peças e Custos', icon: DollarSign },
                { id: 'audit', label: 'Auditoria e Assinaturas', icon: ShieldCheck }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-2 py-3 text-[11px] font-bold uppercase tracking-widest border-b-2 transition-all whitespace-nowrap ${activeTab === tab.id ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`}
                >
                  <tab.icon size={14} /> {tab.label}
                </button>
              ))}
            </div>

            {/* CONTENT AREA */}
            <div className="flex-1 overflow-y-auto p-6 bg-slate-50/30 custom-scrollbar">

              {/* TAB: VISÃO GERAL */}
              {activeTab === 'overview' && (
                <div className="grid grid-cols-12 gap-6">
                  {/* Left Column: Details */}
                  <div className="col-span-12 md:col-span-8 space-y-6">
                    {/* Info Card Grid */}
                    <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm">
                      <h3 className="text-[11px] font-bold text-slate-900 uppercase tracking-wide border-b border-slate-100 pb-3 mb-4 flex items-center gap-2">
                        <User size={14} className="text-slate-400" /> Detalhes do Cliente
                      </h3>
                      <div className="grid grid-cols-2 gap-y-4 gap-x-8">
                        <div>
                          <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold block mb-1">Cliente / Razão Social</label>
                          <div className="text-sm font-semibold text-slate-900">{selectedOrder.customerName}</div>
                        </div>
                        <div>
                          <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold block mb-1">Endereço / Local</label>
                          <div className="text-sm text-slate-700">{selectedOrder.customerAddress}</div>
                        </div>
                        <div>
                          <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold block mb-1">Contato</label>
                          <div className="text-sm text-slate-700">Não informado</div>
                        </div>
                        <div>
                          <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold block mb-1">Documento / CNPJ</label>
                          <div className="text-sm text-slate-700">Não informado</div>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm">
                      <h3 className="text-[11px] font-bold text-slate-900 uppercase tracking-wide border-b border-slate-100 pb-3 mb-4 flex items-center gap-2">
                        <FileText size={14} className="text-slate-400" /> Relatório Técnico
                      </h3>
                      <div className="relative">
                        <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold block mb-2">Descrição das Atividades</label>
                        <div className="p-4 bg-slate-50 rounded border border-slate-100 text-sm text-slate-700 leading-relaxed whitespace-pre-wrap min-h-[100px]">
                          {selectedOrder.description || "Nenhuma observação técnica registrada."}
                        </div>
                      </div>
                      {selectedOrder.notes && (
                        <div className="mt-4">
                          <label className="text-[10px] uppercase tracking-wider text-indigo-500 font-bold block mb-2">Notas de Fechamento</label>
                          <div className="p-3 bg-indigo-50/50 rounded border border-indigo-100 text-xs font-medium text-indigo-900">
                            {selectedOrder.notes}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right Column: Metadata */}
                  <div className="col-span-12 md:col-span-4 space-y-4">
                    {/* Dates Card */}
                    <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                      <h3 className="text-[10px] font-bold text-slate-900 uppercase mb-3 flex items-center gap-2"><Clock size={12} /> Cronograma</h3>
                      <div className="space-y-3">
                        <div className="flex justify-between items-center border-b border-slate-50 pb-2">
                          <span className="text-[10px] text-slate-500 uppercase font-bold">Abertura</span>
                          <span className="text-xs font-medium text-slate-900">{new Date(selectedOrder.createdAt).toLocaleDateString()}</span>
                        </div>
                        <div className="flex justify-between items-center border-b border-slate-50 pb-2">
                          <span className="text-[10px] text-slate-500 uppercase font-bold">Agendado</span>
                          <span className="text-xs font-bold text-indigo-600">{formatDateDisplay(selectedOrder.scheduledDate)} {selectedOrder.scheduledTime}</span>
                        </div>
                        <div className="flex justify-between items-center bg-emerald-50/50 p-2 rounded">
                          <span className="text-[10px] text-emerald-600 uppercase font-bold">Execução</span>
                          <div className="text-right">
                            <span className="text-[10px] block font-bold text-emerald-700">{selectedOrder.startDate ? new Date(selectedOrder.startDate).toLocaleString([], { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '--/--'}</span>
                            <span className="text-[10px] block font-bold text-emerald-700">{selectedOrder.endDate ? new Date(selectedOrder.endDate).toLocaleString([], { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '--/--'}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Tech Card */}
                    <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                      <h3 className="text-[10px] font-bold text-slate-900 uppercase mb-3 flex items-center gap-2"><UserCheck size={12} /> Técnico</h3>
                      {(() => {
                        const tech = techs.find(t => t.id === selectedOrder.assignedTo);
                        return tech ? (
                          <div className="flex items-center gap-3">
                            <img src={tech.avatar} className="w-10 h-10 rounded bg-slate-100 object-cover" />
                            <div>
                              <div className="text-xs font-bold text-slate-900 uppercase">{tech.name}</div>
                              <div className="text-[10px] text-slate-500">Técnico de Campo</div>
                            </div>
                          </div>
                        ) : <span className="text-xs text-slate-400 italic">Não atribuído</span>;
                      })()}
                    </div>

                    {/* Asset Card */}
                    <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                      <h3 className="text-[10px] font-bold text-slate-900 uppercase mb-3 flex items-center gap-2"><Box size={12} /> Ativo / Equipamento</h3>
                      <div className="space-y-2">
                        <div className="text-sm font-bold text-slate-900 uppercase">{selectedOrder.equipmentName || 'N/A'}</div>
                        <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-500 uppercase">
                          <div><span className="block font-bold">Modelo</span> {selectedOrder.equipmentModel || '-'}</div>
                          <div><span className="block font-bold">Série</span> {selectedOrder.equipmentSerial || '-'}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB: EXECUÇÃO (CHECKLIST) */}
              {activeTab === 'execution' && (
                <div className="max-w-4xl mx-auto">
                  {selectedOrder.status === 'IMPEDIDO' && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex items-start gap-4">
                      <AlertTriangle className="text-red-600 shrink-0" size={20} />
                      <div>
                        <h4 className="text-sm font-bold text-red-900 uppercase">Atendimento Impedido</h4>
                        <p className="text-xs text-red-700 mt-1">{selectedOrder.formData?.impediment_reason || selectedOrder.notes?.replace('IMPEDIMENTO: ', '') || 'Sem motivo detalhado.'}</p>
                      </div>
                    </div>
                  )}

                  <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
                    <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex justify-between items-center">
                      <h3 className="text-xs font-bold text-slate-700 uppercase">Lista de Verificação (Checklist)</h3>
                      <span className="text-[10px] font-bold text-slate-400 uppercase">{Object.keys(selectedOrder.formData || {}).length} itens verificados</span>
                    </div>
                    {(selectedOrder.formData && Object.keys(selectedOrder.formData).length > 0) ? (
                      <div className="divide-y divide-slate-100">
                        {Object.entries(selectedOrder.formData).filter(([key, val]) => {
                          if (Array.isArray(val)) return false;
                          if (typeof val === 'string' && (val.startsWith('http') || val.startsWith('data:image'))) return false;
                          if (key.includes('Assinatura') || key.includes('impediment')) return false;
                          if (['signature', 'signatureName', 'signatureDoc', 'finishedAt'].includes(key)) return false;
                          return true;
                        }).map(([key, val]) => (
                          <div key={key} className="px-5 py-3 flex justify-between gap-4 hover:bg-slate-50 items-center">
                            <div className="text-xs font-medium text-slate-600 uppercase">{key}</div>
                            <div className={`text-xs font-bold uppercase px-2 py-1 rounded ${String(val).toLowerCase() === 'ok' || String(val).toLowerCase() === 'sim' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-800'}`}>
                              {String(val)}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-10 text-center text-slate-400 text-xs uppercase italic">Nenhum dado de checklist registrado.</div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB: MÍDIAS */}
              {activeTab === 'media' && (
                <div className="space-y-6">
                  {Object.entries(selectedOrder.formData || {}).map(([key, val]) => {
                    let photos: string[] = [];
                    if (Array.isArray(val)) photos = val;
                    else if (typeof val === 'string' && (val.startsWith('http') || val.startsWith('data:image'))) photos = [val];

                    if (photos.length === 0) return null;
                    return (
                      <div key={key} className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                        <h4 className="text-xs font-bold text-slate-700 uppercase mb-3 pb-2 border-b border-slate-100">{key}</h4>
                        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
                          {photos.map((p, i) => (
                            <div key={i} className="aspect-square bg-slate-100 rounded border border-slate-200 overflow-hidden cursor-zoom-in" onClick={() => setFullscreenImage(p)}>
                              <img src={p} className="w-full h-full object-cover hover:scale-110 transition-transform duration-300" />
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* TAB: CUSTOS */}
              {activeTab === 'costs' && (
                <div className="max-w-4xl mx-auto space-y-6">
                  <div className="flex justify-between items-center bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 uppercase">Peças e Serviços</h3>
                      <p className="text-[10px] text-slate-500 uppercase">Itens aplicados na ordem de serviço</p>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] font-bold text-slate-400 uppercase">Total Geral</div>
                      <div className="text-xl font-bold text-indigo-600 font-mono">
                        R$ {(selectedOrder.items?.reduce((acc, i) => acc + i.total, 0) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
                    <table className="w-full text-left">
                      <thead className="bg-slate-50 text-[10px] font-bold text-slate-500 uppercase border-b border-slate-200">
                        <tr>
                          <th className="px-4 py-3">Descrição</th>
                          <th className="px-4 py-3 text-center">Origem</th>
                          <th className="px-4 py-3 text-center">Qtd</th>
                          <th className="px-4 py-3 text-right">Unitário</th>
                          <th className="px-4 py-3 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {selectedOrder.items?.map(item => (
                          <tr key={item.id} className="hover:bg-slate-50">
                            <td className="px-4 py-3 font-medium text-slate-700">{item.description}</td>
                            <td className="px-4 py-3 text-center">
                              <span className={`text-[9px] px-2 py-0.5 rounded uppercase font-bold ${item.fromStock ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                                {item.fromStock ? 'Estoque' : 'Manual'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center text-slate-600">{item.quantity}</td>
                            <td className="px-4 py-3 text-right font-mono text-slate-600">R$ {item.unitPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                            <td className="px-4 py-3 text-right font-mono font-bold text-slate-800">R$ {item.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                          </tr>
                        ))}
                        {(!selectedOrder.items || selectedOrder.items.length === 0) && (
                          <tr><td colSpan={5} className="py-8 text-center text-slate-400 italic text-xs">Nenhum item adicionado.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* TAB: AUDITORIA */}
              {activeTab === 'audit' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm flex flex-col items-center text-center">
                    <ShieldCheck size={48} className="text-slate-200 mb-4" />
                    <h3 className="text-sm font-bold text-slate-900 uppercase">Validação Técnica</h3>
                    <p className="text-[10px] text-slate-500 uppercase mt-1 mb-6">Assinatura do Técnico Responsável</p>
                    <div className="flex-1 flex items-end w-full justify-center">
                      <div className="border-b border-slate-300 w-2/3 pb-1">
                        <div className="text-sm font-bold text-slate-800 uppercase">{techs.find(t => t.id === selectedOrder.assignedTo)?.name || 'Técnico'}</div>
                      </div>
                    </div>
                    <div className="mt-4 p-2 bg-slate-50 rounded border border-slate-100 w-full">
                      <p className="text-[9px] font-mono text-slate-400 break-all">{selectedOrder.id}-AUTH-{new Date(selectedOrder.createdAt).getTime()}</p>
                    </div>
                  </div>

                  <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm flex flex-col items-center text-center">
                    <UserCheck size={48} className="text-slate-200 mb-4" />
                    <h3 className="text-sm font-bold text-slate-900 uppercase">Aceite do Cliente</h3>
                    <p className="text-[10px] text-slate-500 uppercase mt-1 mb-6">Confirmação de Execução de Serviço</p>

                    {(() => {
                      const data = selectedOrder.formData || {};
                      const signature = data.signature || data['Assinatura do Cliente'] || Object.entries(data).find(([k, v]) => k.toLowerCase().includes('assinat') && typeof v === 'string' && (v.startsWith('data:') || v.startsWith('http')))?.[1];
                      const name = data.signatureName || data['Assinatura do Cliente - Nome'] || selectedOrder.customerName;

                      return signature ? (
                        <div className="w-full">
                          <img src={signature} className="h-20 mx-auto object-contain mix-blend-multiply mb-2" alt="Assinatura" />
                          <div className="border-t border-slate-200 pt-2">
                            <div className="text-sm font-bold text-slate-900 uppercase">{name}</div>
                            <div className="text-[10px] text-slate-500 uppercase">Assinado digitalmente</div>
                          </div>
                        </div>
                      ) : (
                        <div className="py-4 text-xs text-slate-400 italic">Assinatura pendente ou não capturada.</div>
                      );
                    })()}
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      )}


      {/* Batch Print Container - Renderizado via Portal p/ ficar fora das restrições do App */}
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

      {/* 🚀 NEXUS IMMERSIVE LIGHTBOX VIEWER */}
      {fullscreenImage && (
        <div
          className="fixed inset-0 z-[1000] bg-slate-900/95 backdrop-blur-xl flex items-center justify-center p-4 sm:p-10 animate-fade-in cursor-zoom-out"
          onClick={() => setFullscreenImage(null)}
        >
          <div className="relative max-w-5xl w-full h-full flex items-center justify-center pointer-events-none">
            <img
              src={fullscreenImage}
              className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl animate-scale-up pointer-events-auto"
              alt="Imersão Nexus"
            />
            <div className="absolute top-0 right-0 p-4">
              <div className="p-3 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors cursor-pointer pointer-events-auto">
                <X size={24} strokeWidth={3} />
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

