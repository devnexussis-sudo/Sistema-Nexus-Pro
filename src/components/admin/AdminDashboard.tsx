
import React, { useState, useMemo, useEffect } from 'react';
import { OrderStatus, OrderPriority, type ServiceOrder, type User, type Customer } from '../../types';
import { Button } from '../ui/Button';
import { StatusBadge, PriorityBadge } from '../ui/StatusBadge';
import {
  Plus, Printer, X, FileText, CheckCircle2, ShieldCheck,
  Edit3, ExternalLink, Search, Filter, Calendar, Share2,
  Users, UserCheck, Clock, FileSpreadsheet, Download, Camera, ClipboardList, Ban, MapPin, Box,
  DollarSign, Eye, EyeOff, LayoutDashboard, User, AlertTriangle
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
    <div className="p-6 animate-fade-in flex flex-col h-full bg-slate-50 overflow-hidden">
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
            {selectedOrderIds.length > 0 && (
              <div className="flex items-center gap-2 px-3 h-10 bg-slate-100 border border-slate-200 rounded-md animate-in fade-in slide-in-from-right-2">
                <span className="text-xs font-bold text-slate-600">{selectedOrderIds.length} selecionados</span>
                <div className="w-px h-4 bg-slate-300 mx-1" />
                <button onClick={handleBatchPrint} className="p-1.5 text-slate-500 hover:text-slate-700 transition-colors" title="Imprimir"><Printer size={16} /></button>
                <button onClick={handleExportExcel} className="p-1.5 text-slate-500 hover:text-slate-700 transition-colors" title="Excel"><FileSpreadsheet size={16} /></button>
                <button onClick={() => setSelectedOrderIds([])} className="p-1.5 text-slate-400 hover:text-rose-500 transition-colors"><X size={16} /></button>
              </div>
            )}

            <Button
              variant="primary"
              className="h-10 px-5 gap-2"
              onClick={() => { setOrderToEdit(null); setIsCreateModalOpen(true); }}
            >
              <Plus size={16} /> Novo Atendimento
            </Button>
          </div>
        </div>
      </div>

      {/* Main Table Container */}
      <div className="bg-white border border-slate-200 rounded-lg shadow-sm flex flex-col overflow-hidden flex-1">
        <div className="flex-1 overflow-auto custom-scrollbar">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 z-10">
              <tr className="text-[11px] font-bold text-slate-500 uppercase tracking-wider text-left">
                <th className="px-5 py-4 w-12 text-center">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500 cursor-pointer"
                    checked={filteredOrders.length > 0 && selectedOrderIds.length === filteredOrders.length}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th className="px-4 py-4">Protocolo</th>
                <th className="px-4 py-4">Agendamento</th>
                <th className="px-4 py-4">Abertura</th>
                <th className="px-4 py-4">Cliente</th>
                <th className="px-4 py-4 text-center">Técnico</th>
                <th className="px-4 py-4">Status</th>
                <th className="px-4 py-4 text-right pr-10">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredOrders.length > 0 ? filteredOrders.map(order => {
                const isSelected = selectedOrderIds.includes(order.id);
                const assignedTech = techs.find(t => t.id === order.assignedTo);
                return (
                  <tr
                    key={order.id}
                    className={`transition-colors border-b border-slate-50 group cursor-pointer ${isSelected ? 'bg-slate-50' : 'bg-white hover:bg-slate-50/50'}`}
                    onClick={() => setSelectedOrder(order)}
                  >
                    <td className="px-5 py-3.5 text-center" onClick={(e) => toggleSelection(order.id, e)}>
                      <input
                        type="checkbox"
                        className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500 cursor-pointer"
                        checked={isSelected}
                        readOnly
                      />
                    </td>
                    <td className="px-4 py-3.5 font-bold text-slate-900 text-xs tracking-tight">#{order.id}</td>
                    <td className="px-4 py-3.5 text-xs font-semibold text-slate-700">
                      {formatDateDisplay(order.scheduledDate)}
                    </td>
                    <td className="px-4 py-3.5 text-xs text-slate-500 font-medium">
                      {order.createdAt ? new Date(order.createdAt).toLocaleDateString('pt-BR') : '---'}
                    </td>
                    <td className="px-4 py-3.5 font-semibold text-xs text-slate-800 truncate max-w-[220px]">
                      {customers.find(c => c.name === order.customerName || c.document === order.customerName)?.name || order.customerName}
                    </td>

                    <td className="px-4 py-3.5">
                      <div className="flex justify-center">
                        {assignedTech ? (
                          <div className="flex items-center gap-2 px-2 py-1 rounded bg-slate-50 border border-slate-100">
                            <img src={assignedTech.avatar} className="w-5 h-5 rounded-full object-cover grayscale-[0.5]" />
                            <span className="text-[10px] font-bold text-slate-600 truncate max-w-[80px]">{assignedTech?.name?.split(' ')[0]}</span>
                          </div>
                        ) : <span className="text-[10px] text-slate-300 font-bold uppercase tracking-tight">-</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3.5"><StatusBadge status={order.status} /></td>
                    <td className="px-4 py-3.5 text-right pr-6">
                      <div className="flex items-center justify-end gap-1 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => handleOpenPublicView(order, e)}
                          className="p-1.5 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-all"
                          title="Compartilhar"
                        >
                          <Share2 size={16} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setOrderToEdit(order); setIsCreateModalOpen(true); }}
                          disabled={order.status === OrderStatus.CANCELED}
                          className="p-1.5 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded-md disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                          title="Editar"
                        >
                          <Edit3 size={16} />
                        </button>
                        <button
                          onClick={(e) => handleCancelOrder(order, e)}
                          disabled={order.status === OrderStatus.CANCELED}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md disabled:opacity-30 disabled:hover:bg-transparent transition-all"
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
                  <td colSpan={8} className="py-24 text-center bg-white">
                    <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-100">
                      <Search size={20} className="text-slate-300" />
                    </div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Nenhuma atividade localizada</p>
                    <p className="text-[11px] text-slate-300 font-medium mt-1">Ajuste os filtros para encontrar o que procura</p>
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
                    <h2 className="text-base font-bold text-slate-900">Ordem de Serviço #{selectedOrder.id}</h2>
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
                        <User size={18} className="text-slate-400" /> Informações do Cliente
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

                  <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
                    <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
                      <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Lista de Verificação (Checklist)</h3>
                      <span className="px-2 py-0.5 bg-white border border-slate-200 text-[10px] font-bold text-slate-500 rounded uppercase">
                        {Object.keys(selectedOrder.formData || {}).length} Itens
                      </span>
                    </div>
                    {(selectedOrder.formData && Object.keys(selectedOrder.formData).length > 0) ? (
                      <div className="divide-y divide-slate-50">
                        {Object.entries(selectedOrder.formData).filter(([key, val]) => {
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
                    ) : (
                      <div className="p-20 text-center">
                        <ClipboardList className="w-12 h-12 text-slate-100 mx-auto mb-4" />
                        <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Aguardando preenchimento do checklist</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB: MÍDIAS */}
              {activeTab === 'media' && (
                <div className="space-y-8">
                  {Object.entries(selectedOrder.formData || {}).map(([key, val]) => {
                    let photos: string[] = [];
                    if (Array.isArray(val)) photos = val;
                    else if (typeof val === 'string' && (val.startsWith('http') || val.startsWith('data:image'))) photos = [val];

                    if (photos.length === 0) return null;
                    return (
                      <div key={key} className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
                        <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-6 pb-2 border-b border-slate-100 flex items-center gap-2">
                          <Camera size={16} className="text-slate-400" /> {key}
                        </h4>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-4">
                          {photos.map((p, i) => (
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
                    );
                  })}
                  {(!selectedOrder.formData || Object.keys(selectedOrder.formData).length === 0) && (
                    <div className="py-20 text-center bg-white border border-slate-200 rounded-lg">
                      <Camera className="w-12 h-12 text-slate-100 mx-auto mb-4" />
                      <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Nenhuma evidência fotográfica registrada</p>
                    </div>
                  )}
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
                          <th className="px-6 py-4">Item / Serviço</th>
                          <th className="px-4 py-4 text-center">Procedência</th>
                          <th className="px-4 py-4 text-center">Quant.</th>
                          <th className="px-4 py-4 text-right">Unitário</th>
                          <th className="px-6 py-4 text-right">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50 text-sm">
                        {selectedOrder.items?.map(item => (
                          <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-6 py-4 font-semibold text-slate-800">{item.description}</td>
                            <td className="px-4 py-4 text-center">
                              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase border ${item.fromStock ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                                {item.fromStock ? 'Estoque' : 'Avulso'}
                              </span>
                            </td>
                            <td className="px-4 py-4 text-center text-slate-600 font-medium">{item.quantity}</td>
                            <td className="px-4 py-4 text-right font-mono text-slate-500 text-xs">R$ {item.unitPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                            <td className="px-6 py-4 text-right font-mono font-bold text-slate-900">R$ {item.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
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
                        {selectedOrder.id}-VALID-{new Date(selectedOrder.createdAt).getTime()}
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

