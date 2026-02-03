
import React, { useState, useMemo, useEffect } from 'react';
import { ServiceOrder, User, OrderStatus, OrderPriority, Customer } from '../../types';
import { Button } from '../ui/Button';
import { StatusBadge, PriorityBadge } from '../ui/StatusBadge';
import {
  Plus, Printer, X, FileText, CheckCircle2, ShieldCheck,
  Edit3, ExternalLink, Search, Filter, Calendar, Share2,
  Users, UserCheck, Clock, FileSpreadsheet, Download, Camera, ClipboardList, Ban, MapPin, Box
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
  const [activeTab, setActiveTab] = useState<'overview' | 'execution' | 'media' | 'audit'>('overview');
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);

  const handleExportExcel = () => {
    const selectedOrders = orders.filter(o => selectedOrderIds.includes(o.id));
    if (selectedOrders.length === 0) return;

    // 1. Preparar os dados brutos exatamente como no Banco de Dados
    const exportData = selectedOrders.map(o => ({
      id: o.id,
      tenantId: o.tenantId || '',
      title: o.title,
      description: o.description,
      customerName: o.customerName,
      customerAddress: o.customerAddress,
      status: o.status,
      priority: o.priority,
      operationType: o.operationType || '',
      assignedTo: o.assignedTo || '',
      formId: o.formId || '',
      equipmentName: o.equipmentName || '',
      equipmentModel: o.equipmentModel || '',
      equipmentSerial: o.equipmentSerial || '',
      createdAt: o.createdAt,
      updatedAt: o.updatedAt,
      scheduledDate: o.scheduledDate,
      scheduledTime: o.scheduledTime || '',
      startDate: o.startDate || '',
      endDate: o.endDate || '',
      notes: o.notes || '',
      formData: JSON.stringify(o.formData || {})
    }));

    // 2. Criar a planilha a partir dos dados (Formato Nativo Excel)
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Ordens de Servico");

    // 3. Ajustar largura das colunas automaticamente para melhor visualização
    const wscols = [
      { wch: 15 }, // id
      { wch: 15 }, // tenantId
      { wch: 30 }, // title
      { wch: 50 }, // description
      { wch: 25 }, // customerName
      { wch: 40 }, // customerAddress
      { wch: 15 }, // status
      { wch: 10 }, // priority
      { wch: 15 }, // operationType
      { wch: 20 }, // assignedTo
      { wch: 15 }, // formId
      { wch: 20 }, // equipmentName
      { wch: 20 }, // equipmentModel
      { wch: 20 }, // equipmentSerial
      { wch: 20 }, // createdAt
      { wch: 20 }, // updatedAt
      { wch: 15 }, // scheduledDate
      { wch: 12 }, // scheduledTime
      { wch: 15 }, // startDate
      { wch: 15 }, // endDate
      { wch: 40 }, // notes
      { wch: 60 }, // formData
    ];
    worksheet['!cols'] = wscols;

    // 4. Gerar arquivo e disparar download (Ajuste Específico para Chrome / Localhost)
    try {
      const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'binary' });

      const s2ab = (s: string) => {
        const buf = new ArrayBuffer(s.length);
        const view = new Uint8Array(buf);
        for (let i = 0; i !== s.length; ++i) view[i] = s.charCodeAt(i) & 0xFF;
        return buf;
      };

      const blob = new Blob([s2ab(wbout)], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      });

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');

      link.href = url;
      link.download = "nexus_export.xlsx";

      document.body.appendChild(link);
      link.click();

      // Delay maior para o Chrome processar o arquivo binário antes de limpar o link
      setTimeout(() => {
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      }, 5000);

      console.log("✅ Exportação Chrome finalizada.");
    } catch (err) {
      console.error("❌ Falha na exportação Chrome:", err);
      alert("Erro ao gerar o arquivo para o Chrome.");
    }
  };

  const handleBatchPrint = () => {
    setIsBatchPrinting(true);
    document.body.classList.add('is-printing');
    // Tempo maior para garantir renderização de imagens e componentes
    setTimeout(() => {
      window.print();
      setIsBatchPrinting(false);
      document.body.classList.remove('is-printing');
    }, 1500);
  };

  const handlePrintOrder = (orderId: string) => {
    setSelectedOrderIds([orderId]);
    setIsBatchPrinting(true);
    document.body.classList.add('is-printing');
    setTimeout(() => {
      window.print();
      setIsBatchPrinting(false);
      document.body.classList.remove('is-printing');
    }, 1500);
  };

  // States para Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

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

      const sDate = order.scheduledDate;
      const eDate = order.endDate ? order.endDate.split('T')[0] : null;
      const cDate = order.createdAt ? order.createdAt.split('T')[0] : null;

      let matchesTime = true;
      if (startDate && endDate) {
        if (order.status === OrderStatus.COMPLETED && eDate) {
          matchesTime = eDate >= startDate && eDate <= endDate;
        } else if (sDate) {
          matchesTime = sDate >= startDate && sDate <= endDate;
        } else if (cDate) {
          matchesTime = cDate >= startDate && cDate <= endDate;
        } else {
          matchesTime = false;
        }
      }

      return matchesSearch && matchesStatus && matchesTech && matchesCustomer && matchesTime;
    });
  }, [orders, techs, searchTerm, statusFilter, startDate, endDate, techFilter, customerFilter]);

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
      <div className="mb-2 space-y-3">
        <div className="flex flex-col lg:flex-row justify-between items-center gap-3">
          <div className="relative w-full max-w-xl">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder="Pesquisar protocolo, cliente ou descrição..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl pl-12 pr-6 py-3 text-[11px] font-bold text-slate-700 outline-none focus:ring-4 focus:ring-indigo-100 transition-all shadow-sm"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 bg-white border border-slate-200 p-1.5 rounded-xl shadow-sm">
            <div className="flex bg-slate-50 p-1 rounded-lg">
              {['today', 'week', 'month'].map((f) => (
                <button
                  key={f}
                  onClick={() => handleFastFilter(f as any)}
                  className="px-3 py-1.5 text-[8px] font-black uppercase rounded-md transition-all text-slate-500 hover:text-indigo-600 hover:bg-white active:scale-95"
                >{f === 'today' ? 'Hoje' : f === 'week' ? 'Semana' : 'Mês'}</button>
              ))}
            </div>
            <div className="h-4 w-[1px] bg-slate-200 mx-1"></div>
            <div className="flex items-center gap-2 px-2 border-r border-slate-100">
              <Calendar size={16} className="text-indigo-600" />
              <span className="text-[9px] font-black uppercase text-slate-400">Período</span>
            </div>
            <div className="flex items-center gap-2">
              <input type="date" value={startDate} onChange={e => onDateChange(e.target.value, endDate)} className="bg-slate-50 border-none text-[10px] font-black uppercase text-slate-600 rounded-lg px-2 py-1 outline-none" />
              <span className="text-[10px] font-black text-slate-300">até</span>
              <input type="date" value={endDate} onChange={e => onDateChange(startDate, e.target.value)} className="bg-slate-50 border-none text-[10px] font-black uppercase text-slate-600 rounded-lg px-2 py-1 outline-none" />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center bg-white border border-slate-200 rounded-xl p-1 px-3 shadow-sm h-10">
            <Filter size={14} className="text-slate-400 mr-2" />
            <select className="bg-transparent text-[10px] font-black uppercase text-slate-600 outline-none" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="ALL">Todos Status</option>
              {Object.values(OrderStatus).map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          {/* Tech & Customer quick filters could be added here as needed */}
          <button
            onClick={() => {
              setSearchTerm(''); setStatusFilter('ALL'); setTechFilter('ALL'); setCustomerFilter('ALL');
              onDateChange('', ''); // Limpa globalmente
              setSelectedOrderIds([]);
            }}
            className="px-4 py-2 text-[9px] font-black uppercase text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors border border-dashed border-indigo-200"
          >
            Limpar Filtros
          </button>

          {/* Action Buttons Integrated into Toolbar */}
          <div className="flex items-center gap-2 ml-auto">
            {selectedOrderIds.length > 0 && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 border border-indigo-200 rounded-xl animate-fade-in shadow-sm mr-2">
                <span className="text-[9px] font-black text-indigo-700 uppercase italic hidden xl:inline">{selectedOrderIds.length} Sel.</span>
                <button onClick={handleBatchPrint} className="text-indigo-600 hover:text-indigo-800" title="Imprimir"><Printer size={14} /></button>
                <div className="h-3 w-[1px] bg-indigo-200" />
                <button onClick={handleExportExcel} className="text-emerald-600 hover:text-emerald-800" title="Excel"><FileSpreadsheet size={14} /></button>
                <button onClick={() => setSelectedOrderIds([])} className="text-indigo-400 hover:text-red-500"><X size={14} /></button>
              </div>
            )}

            <button
              onClick={() => { setOrderToEdit(null); setIsCreateModalOpen(true); }}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-[9px] font-black uppercase italic shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 transition-all active:scale-95"
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
                    <td className="px-4 py-5 font-bold text-[11px] uppercase text-slate-700 truncate max-w-[200px]">
                      {customers.find(c => c.name === order.customerName || c.document === order.customerName)?.name || order.customerName}
                    </td>

                    <td className="px-4 py-5">
                      {assignedTech ? (
                        <div className="flex items-center gap-2">
                          <img src={assignedTech.avatar} className="w-6 h-6 rounded-lg object-cover border border-slate-100" />
                          <span className="text-[10px] font-black uppercase text-slate-500 italic">{assignedTech.name.split(' ')[0]}</span>
                        </div>
                      ) : <span className="text-[8px] text-slate-300 italic font-black">---</span>}
                    </td>
                    <td className="px-4 py-5"><StatusBadge status={order.status} /></td>
                    <td className="px-4 py-5">
                      <div className="flex flex-col">
                        <span className="text-[8px] font-black text-slate-300 uppercase italic">I: {order.startDate ? new Date(order.startDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}</span>
                        <span className="text-[8px] font-black text-slate-300 uppercase italic">F: {order.endDate ? new Date(order.endDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-5 text-right pr-6">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={(e) => handleOpenPublicView(order, e)} className="p-2.5 bg-white text-slate-400 hover:text-indigo-600 rounded-xl shadow-sm border border-slate-100 hover:border-indigo-100 transition-all">
                          <Share2 size={14} />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); setOrderToEdit(order); setIsCreateModalOpen(true); }} className="p-2.5 bg-white text-slate-400 hover:text-indigo-600 rounded-xl shadow-sm border border-slate-100 hover:border-indigo-100 transition-all">
                          <Edit3 size={14} />
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
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/40 backdrop-blur-xl p-4 sm:p-8">
          <div className="bg-white rounded-[3rem] w-full max-w-[96vw] h-[92vh] shadow-[0_32px_128px_rgba(0,0,0,0.2)] border border-white/50 overflow-hidden flex flex-col animate-scale-up">

            {/* AUDIT HEADER */}
            <div className="px-10 py-8 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row justify-between items-center gap-6">
              <div className="flex items-center gap-6">
                <div className="w-16 h-16 bg-slate-900 rounded-[1.5rem] flex items-center justify-center text-white shadow-2xl rotate-3 shadow-indigo-500/20">
                  <ShieldCheck size={32} />
                </div>
                <div>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full border border-indigo-100 uppercase tracking-widest">Protocolo #{selectedOrder.id}</span>
                    <StatusBadge status={selectedOrder.status} />
                  </div>
                  <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter italic leading-none mt-2">{selectedOrder.title}</h2>
                </div>
              </div>

              <div className="flex items-center gap-3 bg-white p-2 rounded-2xl shadow-sm border border-slate-100">
                {[
                  { id: 'overview', label: 'Geral', icon: FileText },
                  { id: 'execution', label: 'Execução', icon: ClipboardList },
                  { id: 'media', label: 'Mídias', icon: Camera },
                  { id: 'audit', label: 'Assinaturas', icon: UserCheck }
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`flex items-center gap-2 px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === tab.id ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
                  >
                    <tab.icon size={16} /> {tab.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-3">
                <button onClick={(e) => handleOpenPublicView(selectedOrder, e)} className="p-4 bg-slate-50 text-slate-400 hover:text-indigo-600 rounded-2xl transition-all border border-slate-100 hover:shadow-md">
                  <Share2 size={20} />
                </button>
                <button onClick={() => setSelectedOrder(null)} className="p-4 bg-slate-50 text-slate-400 hover:text-red-500 rounded-2xl transition-all border border-slate-100 hover:shadow-md">
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* AUDIT CONTENT */}
            <div className="flex-1 overflow-y-auto p-10 custom-scrollbar bg-white">

              {/* TAB OVERVIEW */}
              {activeTab === 'overview' && (
                <div className="animate-fade-in space-y-10">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <div className="col-span-2 space-y-8">
                      <div className="bg-slate-50 p-8 rounded-[2.5rem] border border-slate-100 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity"><Users size={120} /></div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Informações do Cliente</p>
                        <h3 className="text-2xl font-black text-slate-900 uppercase italic tracking-tighter leading-none">{selectedOrder.customerName}</h3>
                        <div className="flex items-center gap-2 text-slate-500 mt-3">
                          <MapPin size={14} className="text-indigo-400" />
                          <span className="text-xs font-bold uppercase tracking-tight italic">{selectedOrder.customerAddress}</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-8">
                        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2"><Calendar size={14} /> Cronograma</p>
                          <div className="space-y-4">
                            <div><p className="text-[8px] font-black text-slate-300 uppercase">Abertura</p><p className="text-xs font-bold text-slate-600">{new Date(selectedOrder.createdAt).toLocaleString()}</p></div>
                            <div><p className="text-[8px] font-black text-slate-300 uppercase">Agendado p/</p><p className="text-xs font-black text-indigo-600 uppercase">{formatDateDisplay(selectedOrder.scheduledDate)} às {selectedOrder.scheduledTime}</p></div>
                          </div>
                        </div>
                        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2"><Clock size={14} /> Execução Real</p>
                          <div className="space-y-4">
                            <div><p className="text-[8px] font-black text-slate-300 uppercase">Check-In</p><p className="text-xs font-bold text-emerald-600 uppercase">{selectedOrder.startDate ? new Date(selectedOrder.startDate).toLocaleString() : '---'}</p></div>
                            <div><p className="text-[8px] font-black text-slate-300 uppercase">Check-Out</p><p className="text-xs font-bold text-emerald-600 uppercase">{selectedOrder.endDate ? new Date(selectedOrder.endDate).toLocaleString() : '---'}</p></div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-8">
                      <div className="bg-indigo-600 p-8 rounded-[2.5rem] shadow-xl shadow-indigo-600/20 text-white relative overflow-hidden">
                        <div className="absolute -bottom-4 -right-4 opacity-10"><Box size={140} /></div>
                        <p className="text-[10px] font-black uppercase tracking-widest mb-6 opacity-70">Ativo Relacionado</p>
                        <h4 className="text-xl font-black uppercase italic tracking-tighter leading-tight">{selectedOrder.equipmentName || 'Equipamento não especificado'}</h4>
                        <div className="mt-6 space-y-2 border-t border-white/10 pt-6 font-bold text-[10px] uppercase">
                          <div className="flex justify-between"><span>Modelo</span><span className="text-indigo-200">{selectedOrder.equipmentModel || '--'}</span></div>
                          <div className="flex justify-between"><span>Série</span><span className="text-indigo-200">{selectedOrder.equipmentSerial || '--'}</span></div>
                        </div>
                      </div>

                      <div className="bg-emerald-50 p-8 rounded-[2.5rem] border border-emerald-100">
                        <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-4 flex items-center gap-2"><UserCheck size={14} /> Responsável</p>
                        {(() => {
                          const tech = techs.find(t => t.id === selectedOrder.assignedTo);
                          return tech ? (
                            <div className="flex items-center gap-4">
                              <img src={tech.avatar} className="w-12 h-12 rounded-2xl object-cover border-2 border-white shadow-sm" />
                              <div><p className="font-black text-slate-900 text-sm uppercase italic">{tech.name}</p><p className="text-[9px] text-emerald-600 font-bold uppercase tracking-tight">Técnico Nível 1</p></div>
                            </div>
                          ) : <p className="text-xs font-bold text-slate-400 italic font-black uppercase">Não Atribuído</p>;
                        })()}
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-50 p-8 rounded-[3rem] border border-slate-100">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2"><FileText size={14} /> Descrição das Atividades / Diagnóstico</p>
                    <p className="text-sm font-medium text-slate-700 leading-relaxed italic whitespace-pre-wrap">{selectedOrder.description || "Nenhum relatório técnico fornecido pelo solicitante."}</p>
                  </div>
                </div>
              )}

              {/* TAB EXECUTION (CHECKLIST) */}
              {activeTab === 'execution' && (
                <div className="animate-fade-in space-y-10">
                  {selectedOrder.status === 'IMPEDIDO' && (
                    <div className="bg-red-50 p-10 rounded-[3rem] border-2 border-dashed border-red-200 text-center">
                      <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6"><Ban size={40} className="text-red-500" /></div>
                      <h3 className="text-xl font-black text-red-900 uppercase italic mb-2 tracking-tighter">Atendimento Impedido pelo Técnico</h3>
                      <p className="text-sm font-bold text-red-600 uppercase tracking-widest italic leading-relaxed max-w-xl mx-auto italic">
                        Motivo: "{selectedOrder.formData?.impediment_reason || selectedOrder.notes?.replace('IMPEDIMENTO: ', '') || 'Motivo não detalhado.'}"
                      </p>
                    </div>
                  )}

                  {(selectedOrder.formData && Object.keys(selectedOrder.formData).length > 0) ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {Object.entries(selectedOrder.formData).filter(([key, val]) => {
                        if (Array.isArray(val)) return false;
                        if (typeof val === 'string' && (val.startsWith('http') || val.startsWith('data:image'))) return false;
                        if (key.includes('Assinatura') || key.includes('impediment')) return false;
                        return true;
                      }).map(([key, val]) => (
                        <div key={key} className="flex justify-between items-center p-6 bg-slate-50 rounded-2xl border border-slate-100 group hover:bg-indigo-50 hover:border-indigo-100 transition-all">
                          <span className="text-[10px] font-black text-slate-500 uppercase italic group-hover:text-indigo-400">{key}</span>
                          <span className="text-xs font-black text-slate-900 uppercase">{String(val)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-20 text-center text-slate-300 font-black uppercase text-[10px] italic tracking-[0.3em]">
                      Nenhum checklist registrado para esta operação.
                    </div>
                  )}

                  {selectedOrder.notes && (
                    <div className="bg-indigo-50 p-8 rounded-[2.5rem] border border-indigo-100">
                      <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-4 italic">Observações de Fechamento (Técnico)</p>
                      <p className="text-xs font-bold text-indigo-900 leading-relaxed italic">{selectedOrder.notes}</p>
                    </div>
                  )}
                </div>
              )}

              {/* TAB MEDIA (PHOTOS) */}
              {activeTab === 'media' && (
                <div className="animate-fade-in space-y-10">
                  {/* Photos Gallery */}
                  <div className="space-y-8">
                    {Object.entries(selectedOrder.formData || {}).map(([key, val]) => {
                      let photos: string[] = [];
                      if (Array.isArray(val)) photos = val;
                      else if (typeof val === 'string' && (val.startsWith('http') || val.startsWith('data:image'))) photos = [val];

                      if (photos.length === 0) return null;

                      return (
                        <div key={key} className="space-y-4">
                          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic border-b border-slate-100 pb-2 flex items-center gap-2"><Camera size={14} /> {key}</h4>
                          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                            {photos.map((p, i) => (
                              <div
                                key={i}
                                onClick={() => setFullscreenImage(p)}
                                className="aspect-square bg-slate-100 rounded-3xl overflow-hidden border border-slate-200 group relative cursor-zoom-in shadow-sm hover:shadow-xl transition-all"
                              >
                                <img src={p} className="w-full h-full object-cover grayscale brightness-110 group-hover:grayscale-0 group-hover:scale-110 transition-all duration-500" />
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* TAB AUDIT (SIGNATURES) */}
              {activeTab === 'audit' && (
                <div className="animate-fade-in grid grid-cols-1 md:grid-cols-2 gap-10">
                  {/* Technician Verification */}
                  <div className="bg-slate-50 p-10 rounded-[3rem] border border-slate-100 text-center relative overflow-hidden">
                    <div className="absolute top-0 left-0 p-8 opacity-2 -rotate-12"><ShieldCheck size={200} /></div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mb-8">Auditoria Técnica</p>
                    <div className="w-40 h-1 bg-slate-200 mx-auto mb-10" />
                    <p className="font-black text-slate-900 uppercase italic text-lg">{techs.find(t => t.id === selectedOrder.assignedTo)?.name || 'Responsável Técnico'}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">Validação Digital Nexus Cloud</p>
                    <div className="mt-10 p-4 bg-white/50 rounded-2xl border border-white inline-block">
                      <p className="text-[8px] font-black text-indigo-400 uppercase">Fingerprint de Segurança</p>
                      <p className="font-mono text-[8px] text-slate-400 mt-1 uppercase leading-none">{selectedOrder.id}-SECURE-AUTH-{new Date(selectedOrder.createdAt).getTime()}</p>
                    </div>
                  </div>

                  {/* Customer SCIENCE */}
                  <div className="bg-white p-10 rounded-[3rem] border-2 border-dashed border-slate-200 text-center">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mb-8">Ciência do Cliente</p>

                    {(() => {
                      const data = selectedOrder.formData || {};
                      const signature = data['Assinatura do Cliente'] || Object.entries(data).find(([k, v]) => k.toLowerCase().includes('assinat') && typeof v === 'string')?.[1];
                      const name = data['Assinatura do Cliente - Nome'] || selectedOrder.customerName;
                      const cpf = data['Assinatura do Cliente - CPF'] || 'N/D';

                      return (
                        <div className="space-y-6">
                          {signature ? (
                            <div
                              className="bg-slate-50 p-6 rounded-[2rem] border border-slate-100 flex items-center justify-center min-h-[200px] cursor-zoom-in group"
                              onClick={() => setFullscreenImage(signature)}
                            >
                              <img src={signature} className="max-h-32 object-contain mix-blend-multiply transition-transform group-hover:scale-105" alt="Assinatura" />
                            </div>
                          ) : (
                            <div className="h-[200px] flex flex-col items-center justify-center text-slate-200 gap-4">
                              <UserCheck size={64} opacity={0.3} />
                              <p className="text-[9px] font-black uppercase tracking-widest">Protocolo s/ assinatura manuscrita</p>
                            </div>
                          )}
                          <div>
                            <p className="font-black text-slate-900 uppercase italic text-xl">{name}</p>
                            <p className="text-[10px] font-black text-indigo-500 uppercase mt-1 tracking-widest flex justify-center gap-3">
                              <span>Documento: {cpf}</span>
                              {data['Assinatura do Cliente - Nascimento'] && (
                                <span>• Nascimento: {data['Assinatura do Cliente - Nascimento']}</span>
                              )}
                            </p>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}

            </div>

            {/* AUDIT FOOTER */}
            <div className="p-10 border-t border-slate-100 bg-slate-50/30 flex justify-between items-center">
              <div className="flex gap-10">
                <div>
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Tempo de Resposta</p>
                  <p className="text-xs font-black text-slate-900">42 min <span className="text-emerald-500 leading-none">▼ 12%</span></p>
                </div>
                <div>
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Conformidade</p>
                  <p className="text-xs font-black text-indigo-600 italic uppercase">100% Validado</p>
                </div>
              </div>
              <div className="flex gap-4">
                <Button variant="ghost" className="px-10 rounded-2xl font-black text-[10px] uppercase tracking-widest" onClick={() => setSelectedOrder(null)}>Fechar</Button>
                <Button variant="primary" className="px-10 py-5 rounded-2xl font-black text-xs uppercase italic shadow-xl shadow-indigo-600/20 flex items-center gap-3" onClick={() => handlePrintOrder(selectedOrder.id)}>
                  <Download size={18} /> Baixar Auditoria (PDF)
                </Button>
              </div>
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

