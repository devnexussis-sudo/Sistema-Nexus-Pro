import React, { useState, useMemo } from 'react';
import { ServiceOrder, OrderStatus, User, Quote } from '../../types';
import {
    DollarSign, TrendingUp, CheckCircle2, ClipboardCheck, Calendar, Search,
    Filter, ArrowUpRight, ArrowDownRight, FileText, X, ChevronRight,
    UserCheck, CreditCard, Wallet, Download, ExternalLink, Printer,
    Check, AlertCircle, Bookmark, Calculator, Share2, FileSpreadsheet, Clock
} from 'lucide-react';
import { DataService } from '../../services/dataService';
import * as XLSX from 'xlsx';

interface FinancialDashboardProps {
    orders: ServiceOrder[];
    quotes: Quote[];
    techs: User[];
    onRefresh: () => Promise<void>;
}

export const FinancialDashboard: React.FC<FinancialDashboardProps> = ({ orders, quotes, techs, onRefresh }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [techFilter, setTechFilter] = useState('ALL');
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [selectedItem, setSelectedItem] = useState<any | null>(null);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    // Form de Baixa
    const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
    const [paymentMethod, setPaymentMethod] = useState('Dinheiro');
    const [billingNotes, setBillingNotes] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);

    // 1. Preparar Dados Unificados
    const allItems = useMemo(() => {
        // Orçamentos Aprovados
        const approvedQuotes = quotes.filter(q =>
            q.status === 'APROVADO' || q.status === 'CONVERTIDO'
        ).map(q => ({
            type: 'QUOTE' as const,
            id: q.id,
            customerName: q.customerName,
            customerAddress: q.customerAddress,
            title: q.title,
            description: q.description,
            date: q.createdAt,
            value: Number(q.totalValue) || 0,
            status: q.billingStatus || 'PENDING',
            original: q,
            technician: 'Administrador' // Orçamentos geralmente não tem tech vinculado no início
        }));

        // OS Concluídas
        const completedOrders = orders.filter(o => o.status === OrderStatus.COMPLETED).map(order => {
            const itemsValue = order.items?.reduce((acc, i) => acc + i.total, 0) || 0;
            const value = itemsValue || (order.formData as any)?.totalValue || (order.formData as any)?.price || 0;

            return {
                type: 'ORDER' as const,
                id: order.id,
                customerName: order.customerName,
                customerAddress: order.customerAddress,
                title: order.title,
                description: order.description,
                date: order.updatedAt,
                value: Number(value),
                status: order.billingStatus || 'PENDING',
                original: order,
                technician: order.assignedTo || 'N/A'
            };
        });

        return [...approvedQuotes, ...completedOrders].sort((a, b) =>
            new Date(b.date).getTime() - new Date(a.date).getTime()
        );
    }, [orders, quotes]);

    // 2. Aplicar Filtros
    const filteredItems = useMemo(() => {
        return allItems.filter(item => {
            const itemDate = new Date(item.date).toISOString().split('T')[0];
            const matchesSearch =
                item.customerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                item.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                item.id.toLowerCase().includes(searchTerm.toLowerCase());

            const matchesTech = techFilter === 'ALL' || item.technician === techFilter;

            const matchesDate =
                (!startDate || itemDate >= startDate) &&
                (!endDate || itemDate <= endDate);

            return matchesSearch && matchesTech && matchesDate;
        });
    }, [allItems, searchTerm, techFilter, startDate, endDate]);

    // 3. Cálculos do Dashboard
    const stats = useMemo(() => {
        const totalFaturado = filteredItems.filter(i => i.status === 'PAID').reduce((acc, i) => acc + i.value, 0);
        const totalPendente = filteredItems.filter(i => i.status === 'PENDING').reduce((acc, i) => acc + i.value, 0);

        // Faturamento por Técnico
        const techBilling: Record<string, number> = {};
        filteredItems.forEach(item => {
            const name = item.technician;
            techBilling[name] = (techBilling[name] || 0) + item.value;
        });

        // Top Técnico
        const topTech = Object.entries(techBilling).sort((a, b) => b[1] - a[1])[0] || ['Nenhum', 0];

        return { totalFaturado, totalPendente, topTech };
    }, [filteredItems]);

    // 4. Seleção Dinâmica
    const toggleSelect = (id: string) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    };

    const selectedTotal = useMemo(() => {
        return filteredItems.filter(i => selectedIds.includes(i.id)).reduce((acc, i) => acc + i.value, 0);
    }, [filteredItems, selectedIds]);

    // 5. Handlers
    const handleInvoiceBatch = async () => {
        if (selectedIds.length === 0) return;
        setIsInvoiceModalOpen(true);
    };

    const confirmInvoice = async () => {
        setIsProcessing(true);
        try {
            for (const id of selectedIds) {
                const item = filteredItems.find(i => i.id === id);
                if (!item) continue;

                if (item.type === 'ORDER') {
                    await DataService.updateOrder({
                        ...item.original,
                        billingStatus: 'PAID',
                        paymentMethod,
                        billingNotes,
                        paidAt: new Date().toISOString()
                    });
                } else {
                    await DataService.updateQuote({
                        ...item.original,
                        billingStatus: 'PAID',
                        paymentMethod,
                        billingNotes,
                        paidAt: new Date().toISOString()
                    });
                }
            }
            alert(`✅ ${selectedIds.length} Itens faturados com sucesso!`);
            setSelectedIds([]);
            setIsInvoiceModalOpen(false);
            await onRefresh();
        } catch (error) {
            console.error(error);
            alert("Erro ao processar faturamento.");
        } finally {
            setIsProcessing(false);
        }
    };

    const handleExportExcel = () => {
        if (filteredItems.length === 0) return;

        const exportData = filteredItems.map(item => ({
            ID: item.id,
            Tipo: item.type === 'ORDER' ? 'O.S.' : 'Orçamento',
            Data: new Date(item.date).toLocaleDateString('pt-BR'),
            Cliente: item.customerName,
            Título: item.title,
            Técnico: item.technician,
            Valor: item.value,
            Status: item.status === 'PAID' ? 'Pago' : 'Pendente'
        }));

        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Financeiro");
        XLSX.writeFile(wb, `financeiro_nexus_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    const formatCurrency = (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

    return (
        <div className="p-4 animate-fade-in flex flex-col h-full bg-slate-50/20 overflow-hidden relative">

            {/* Header / Filtros */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6 flex-shrink-0">
                <div className="md:col-span-2 relative group">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-600 transition-colors" size={18} />
                    <input
                        type="text"
                        placeholder="Pesquisar por cliente, título ou protocolo..."
                        className="w-full bg-white border border-slate-200 rounded-3xl pl-12 pr-6 py-4 text-sm font-bold text-slate-700 outline-none focus:ring-4 focus:ring-indigo-100 transition-all shadow-sm"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>

                <div className="flex bg-white border border-slate-200 rounded-3xl p-1 shadow-sm px-4 items-center">
                    <Calendar size={18} className="text-indigo-500 mr-2" />
                    <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-transparent border-none text-[10px] font-black uppercase text-slate-600 outline-none cursor-pointer w-full" />
                    <span className="text-slate-300 mx-1">-</span>
                    <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-transparent border-none text-[10px] font-black uppercase text-slate-600 outline-none cursor-pointer w-full" />
                </div>

                <div className="flex bg-white border border-slate-200 rounded-3xl p-1 shadow-sm px-4 items-center">
                    <UserCheck size={18} className="text-indigo-500 mr-2" />
                    <select
                        className="bg-transparent text-[10px] font-black uppercase text-slate-600 outline-none cursor-pointer w-full h-full py-2"
                        value={techFilter}
                        onChange={e => setTechFilter(e.target.value)}
                    >
                        <option value="ALL">Todos Técnicos</option>
                        {techs.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                        <option value="Administrador">Administrador</option>
                    </select>
                </div>
            </div>

            {/* Dash Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6 flex-shrink-0">
                <div className="bg-indigo-600 p-8 rounded-[2.5rem] shadow-xl shadow-indigo-600/20 text-white relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-125 transition-transform duration-500">
                        <DollarSign size={80} />
                    </div>
                    <p className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-2">Total Realizado (Pago)</p>
                    <h3 className="text-4xl font-black italic tracking-tighter">{formatCurrency(stats.totalFaturado)}</h3>
                    <div className="mt-4 flex items-center gap-2 text-[10px] font-bold bg-white/10 w-fit px-3 py-1 rounded-full border border-white/20">
                        <CheckCircle2 size={12} /> Fluxo de Caixa Ativo
                    </div>
                </div>

                <div className="bg-white p-8 rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:scale-125 transition-transform duration-500 text-indigo-600">
                        <TrendingUp size={80} />
                    </div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Pendente de Recebimento</p>
                    <h3 className="text-4xl font-black text-slate-900 italic tracking-tighter">{formatCurrency(stats.totalPendente)}</h3>
                    <div className="mt-4 flex items-center gap-2 text-[10px] font-bold text-amber-600 bg-amber-50 w-fit px-3 py-1 rounded-full border border-amber-100">
                        <AlertCircle size={12} /> {filteredItems.filter(i => i.status === 'PENDING').length} Itens em aberto
                    </div>
                </div>

                <div className="bg-slate-900 p-8 rounded-[2.5rem] shadow-xl shadow-slate-900/10 text-white relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-8 opacity-20 group-hover:scale-125 transition-transform duration-500">
                        <Bookmark size={80} className="text-indigo-400" />
                    </div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Destaque de Faturamento</p>
                    <h3 className="text-xl font-black italic tracking-tighter mb-1 uppercase">{stats.topTech[0]}</h3>
                    <p className="text-3xl font-black text-indigo-400 italic tracking-tighter">{formatCurrency(stats.topTech[1] as number)}</p>
                    <div className="mt-4 flex items-center gap-2 text-[10px] font-bold text-indigo-300">
                        <TrendingUp size={12} /> Melhor desempenho no período
                    </div>
                </div>
            </div>

            {/* List Table with Selection */}
            <div className="bg-white rounded-[3rem] border border-slate-100 shadow-2xl flex flex-col overflow-hidden flex-1 min-h-0 relative">

                {/* Excel Export Button in Table Header */}
                <div className="absolute top-6 right-8 z-20">
                    <button
                        onClick={handleExportExcel}
                        className="flex items-center gap-2 px-5 py-2.5 bg-emerald-50 text-emerald-600 rounded-xl text-[10px] font-black uppercase hover:bg-emerald-600 hover:text-white transition-all shadow-sm border border-emerald-100"
                    >
                        <FileSpreadsheet size={16} /> Extrair Excel
                    </button>
                </div>

                <div className="flex-1 overflow-auto custom-scrollbar">
                    <table className="w-full text-left border-separate border-spacing-0">
                        <thead className="sticky top-0 bg-white/95 backdrop-blur-md z-10">
                            <tr className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">
                                <th className="p-8 border-b border-slate-50 w-20 text-center">
                                    <input
                                        type="checkbox"
                                        className="w-5 h-5 rounded-lg border-slate-200 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                        checked={filteredItems.length > 0 && selectedIds.length === filteredItems.length}
                                        onChange={() => {
                                            if (selectedIds.length === filteredItems.length) setSelectedIds([]);
                                            else setSelectedIds(filteredItems.map(i => i.id));
                                        }}
                                    />
                                </th>
                                <th className="p-8 border-b border-slate-50">Documento / Cliente</th>
                                <th className="p-8 border-b border-slate-50">Descrição Técnica</th>
                                <th className="p-8 border-b border-slate-50">Técnico Resp.</th>
                                <th className="p-8 border-b border-slate-50">Valor Bruto</th>
                                <th className="p-8 border-b border-slate-50">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {filteredItems.map(item => (
                                <tr
                                    key={item.id}
                                    className={`group hover:bg-slate-50 transition-all cursor-pointer ${selectedIds.includes(item.id) ? 'bg-indigo-50/50' : ''}`}
                                    onClick={() => {
                                        setSelectedItem(item);
                                        setIsSidebarOpen(true);
                                    }}
                                >
                                    <td className="p-8 text-center" onClick={(e) => e.stopPropagation()}>
                                        <input
                                            type="checkbox"
                                            className="w-5 h-5 rounded-lg border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                            checked={selectedIds.includes(item.id)}
                                            onChange={() => toggleSelect(item.id)}
                                        />
                                    </td>
                                    <td className="p-8">
                                        <div className="flex flex-col gap-1">
                                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg w-fit ${item.type === 'QUOTE' ? 'bg-blue-50 text-blue-600' : 'bg-indigo-50 text-indigo-600'}`}>
                                                {item.type === 'QUOTE' ? 'ORC' : 'OS'}#{item.id.slice(0, 8)}
                                            </span>
                                            <p className="text-sm font-black text-slate-900 italic tracking-tight">{item.customerName}</p>
                                            <p className="text-[10px] text-slate-400 font-bold flex items-center gap-1"><Calendar size={10} /> {new Date(item.date).toLocaleDateString('pt-BR')}</p>
                                        </div>
                                    </td>
                                    <td className="p-8">
                                        <p className="text-[11px] font-black text-slate-700 uppercase italic line-clamp-1">{item.title}</p>
                                        <p className="text-[10px] text-slate-400 line-clamp-1 mt-1 font-medium">{item.description || 'Sem descrição adicional'}</p>
                                    </td>
                                    <td className="p-8">
                                        <div className="flex items-center gap-2">
                                            <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-[10px] font-black text-slate-400 border border-white">
                                                {item.technician?.[0]}
                                            </div>
                                            <span className="text-[11px] font-black text-slate-700 italic">{item.technician}</span>
                                        </div>
                                    </td>
                                    <td className="p-8">
                                        <span className="text-lg font-black text-slate-900 italic tracking-tighter">{formatCurrency(item.value)}</span>
                                    </td>
                                    <td className="p-8">
                                        <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-[9px] font-black uppercase tracking-widest ${item.status === 'PAID' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'bg-amber-100 text-amber-600'}`}>
                                            {item.status === 'PAID' ? <Check size={14} /> : <Clock size={14} />}
                                            {item.status === 'PAID' ? 'Pago' : 'Pendente'}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Somatório Flutuante (Fixed Bottom) */}
            {selectedIds.length > 0 && (
                <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[100] animate-fade-in-up">
                    <div className="bg-slate-900/90 backdrop-blur-xl border border-white/20 px-10 py-5 rounded-[3rem] shadow-[0_20px_50px_rgba(0,0,0,0.3)] flex items-center gap-10">
                        <div className="flex flex-col">
                            <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest leading-none mb-1">Itens Selecionados</p>
                            <p className="text-xl font-black text-white italic">{selectedIds.length} Registros</p>
                        </div>
                        <div className="h-10 w-[1px] bg-white/10" />
                        <div className="flex flex-col">
                            <p className="text-[9px] font-black text-emerald-400 uppercase tracking-widest leading-none mb-1">Somatório Total</p>
                            <p className="text-2xl font-black text-emerald-400 italic leading-none">{formatCurrency(selectedTotal)}</p>
                        </div>
                        <button
                            onClick={handleInvoiceBatch}
                            className="bg-emerald-500 hover:bg-emerald-400 text-white px-10 py-4 rounded-2xl font-black uppercase text-[11px] italic tracking-widest shadow-xl shadow-emerald-500/20 transition-all hover:scale-105"
                        >
                            Faturar Seleção <ChevronRight size={18} className="inline ml-1" />
                        </button>
                        <button
                            onClick={() => setSelectedIds([])}
                            className="p-3 text-white/40 hover:text-white transition-all"
                        >
                            <X size={24} />
                        </button>
                    </div>
                </div>
            )}

            {/* Sidebar de Detalhes */}
            {isSidebarOpen && selectedItem && (
                <div className="fixed inset-0 z-[1200] bg-slate-900/40 backdrop-blur-sm flex justify-end animate-fade-in">
                    <div className="bg-white w-full max-w-lg h-full shadow-2xl flex flex-col animate-slide-in-right border-l border-slate-100">
                        <div className="p-10 border-b border-slate-50 flex justify-between items-center bg-slate-50/30">
                            <div>
                                <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">Detalhes do Faturamento</p>
                                <h2 className="text-2xl font-black text-slate-900 uppercase italic tracking-tighter">{selectedItem.type === 'QUOTE' ? 'Orçamento' : 'O.S.'} #{selectedItem.id.slice(0, 8)}</h2>
                            </div>
                            <button onClick={() => setIsSidebarOpen(false)} className="p-4 bg-white text-slate-400 hover:text-slate-900 rounded-2xl shadow-sm border border-slate-100 transition-all">
                                <X size={24} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-10 space-y-10 custom-scrollbar">
                            <div className="space-y-4">
                                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">Cliente & Serviço</h4>
                                <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100 shadow-inner">
                                    <p className="text-xl font-black text-slate-900 uppercase italic mb-1">{selectedItem.customerName}</p>
                                    <p className="text-xs text-slate-500 font-medium mb-6 uppercase tracking-tight">{selectedItem.customerAddress}</p>

                                    <p className="text-[11px] font-black text-indigo-600 uppercase mb-1">Título do Serviço</p>
                                    <p className="text-sm font-bold text-slate-700 uppercase italic">{selectedItem.title}</p>
                                    <p className="text-xs text-slate-400 mt-2 italic">{selectedItem.description}</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-6">
                                <div className="p-6 bg-white border border-slate-100 rounded-3xl shadow-sm">
                                    <p className="text-[8px] font-black text-slate-400 uppercase mb-2">Valor Total</p>
                                    <p className="text-2xl font-black text-indigo-600 italic leading-none">{formatCurrency(selectedItem.value)}</p>
                                </div>
                                <div className="p-6 bg-white border border-slate-100 rounded-3xl shadow-sm">
                                    <p className="text-[8px] font-black text-slate-400 uppercase mb-2">Data Registro</p>
                                    <p className="text-sm font-black text-slate-700 italic flex items-center gap-2 uppercase"><Calendar size={14} className="text-indigo-400" /> {new Date(selectedItem.date).toLocaleDateString()}</p>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">Ações Rápidas</h4>
                                <div className="grid grid-cols-1 gap-3">
                                    {selectedItem.type === 'ORDER' ? (
                                        <button
                                            onClick={() => window.open(`${window.location.origin}${window.location.pathname}#/view-order/${selectedItem.original.publicToken || selectedItem.id}`, '_blank')}
                                            className="w-full py-4 bg-indigo-50 border border-indigo-100 rounded-2xl flex items-center justify-center gap-3 text-indigo-600 font-black uppercase text-[10px] tracking-widest hover:bg-indigo-600 hover:text-white transition-all shadow-sm"
                                        >
                                            <ExternalLink size={16} /> Abrir Link Público da OS
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => window.open(`${window.location.origin}${window.location.pathname}#/view-quote/${selectedItem.original.publicToken || selectedItem.id}`, '_blank')}
                                            className="w-full py-4 bg-blue-50 border border-blue-100 rounded-2xl flex items-center justify-center gap-3 text-blue-600 font-black uppercase text-[10px] tracking-widest hover:bg-blue-600 hover:text-white transition-all shadow-sm"
                                        >
                                            <ExternalLink size={16} /> Abrir Link Público do Orçamento
                                        </button>
                                    )}
                                    <button className="w-full py-4 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-center gap-3 text-white font-black uppercase text-[10px] tracking-widest hover:bg-slate-800 transition-all shadow-xl shadow-slate-900/10">
                                        <Printer size={16} /> Gerar Relatório (PDF)
                                    </button>
                                </div>
                            </div>

                            {selectedItem.status === 'PAID' && (
                                <div className="p-8 bg-emerald-50 border border-emerald-100 rounded-[2.5rem] space-y-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-emerald-500 text-white rounded-xl flex items-center justify-center"><Check size={20} /></div>
                                        <div>
                                            <p className="text-[10px] font-black text-emerald-800 uppercase italic">Faturamento Concluído</p>
                                            <p className="text-[9px] text-emerald-600 font-black uppercase tracking-widest">Informações de Recebimento:</p>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <p className="text-[8px] font-black text-emerald-400 uppercase">Método</p>
                                            <p className="text-xs font-black text-emerald-900 uppercase italic">{selectedItem.original.paymentMethod || 'Dinheiro'}</p>
                                        </div>
                                        <div>
                                            <p className="text-[8px] font-black text-emerald-400 uppercase">Data do Pagto</p>
                                            <p className="text-xs font-black text-emerald-900 uppercase italic">{selectedItem.original.paidAt ? new Date(selectedItem.original.paidAt).toLocaleDateString() : 'N/D'}</p>
                                        </div>
                                    </div>
                                    {selectedItem.original.billingNotes && (
                                        <div className="pt-4 border-t border-emerald-100">
                                            <p className="text-[8px] font-black text-emerald-400 uppercase mb-1">Observações:</p>
                                            <p className="text-[10px] text-emerald-700 italic font-medium">{selectedItem.original.billingNotes}</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="p-10 border-t border-slate-50 bg-slate-50/50 flex gap-4">
                            {selectedItem.status === 'PENDING' ? (
                                <button
                                    onClick={() => {
                                        setSelectedIds([selectedItem.id]);
                                        setIsInvoiceModalOpen(true);
                                    }}
                                    className="flex-1 py-5 bg-emerald-600 text-white rounded-[2rem] font-black uppercase text-xs italic tracking-widest shadow-xl shadow-emerald-600/20 hover:scale-[1.02] active:scale-95 transition-all"
                                >
                                    Faturar Agora <DollarSign size={18} className="inline ml-1" />
                                </button>
                            ) : (
                                <div className="flex-1 py-5 bg-slate-100 text-slate-400 rounded-[2rem] font-black uppercase text-xs italic tracking-widest text-center">
                                    Registrado como Pago
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de Baixa / Faturar */}
            {isInvoiceModalOpen && (
                <div className="fixed inset-0 z-[2000] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-6 animate-fade-in">
                    <div className="bg-white w-full max-w-lg rounded-[3.5rem] shadow-2xl overflow-hidden flex flex-col border border-white">
                        <div className="px-10 py-8 bg-emerald-600 flex justify-between items-center text-white">
                            <div className="flex items-center gap-4">
                                <Wallet size={24} />
                                <div>
                                    <h2 className="text-xl font-black uppercase italic tracking-tighter leading-none">Confirmar Baixa</h2>
                                    <p className="text-[9px] font-black uppercase tracking-widest opacity-60">Confirmar recebimento de {selectedIds.length} item(ns)</p>
                                </div>
                            </div>
                            <button onClick={() => setIsInvoiceModalOpen(false)} className="p-3 bg-white/10 hover:bg-white/20 rounded-xl transition-all"><X size={24} /></button>
                        </div>

                        <div className="p-10 space-y-8">
                            <div className="p-8 bg-emerald-50 rounded-[2.5rem] border border-emerald-100 text-center">
                                <p className="text-[10px] font-black text-emerald-400 uppercase mb-2 tracking-widest">Valor Consolidado</p>
                                <h3 className="text-4xl font-black text-emerald-600 italic tracking-tighter">{formatCurrency(selectedIds.length === 1 ? (selectedItem?.value || 0) : selectedTotal)}</h3>
                            </div>

                            <div className="space-y-4">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2 block italic">Método de Pagamento</label>
                                <div className="grid grid-cols-2 gap-3">
                                    {['Dinheiro', 'Pix', 'Cartão à Vista', 'Cartão Parcelado'].map(method => (
                                        <button
                                            key={method}
                                            onClick={() => setPaymentMethod(method)}
                                            className={`p-5 rounded-2xl border transition-all text-[11px] font-black uppercase italic tracking-tight flex items-center gap-2 ${paymentMethod === method ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg' : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-indigo-200'}`}
                                        >
                                            <CreditCard size={14} className={paymentMethod === method ? 'opacity-100' : 'opacity-20'} /> {method}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-4">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2 block italic">Notas / Comprovante</label>
                                <textarea
                                    className="w-full h-32 bg-slate-50 border border-slate-200 rounded-[2rem] p-6 text-sm font-bold uppercase outline-none focus:ring-4 focus:ring-emerald-50 transition-all resize-none shadow-inner"
                                    placeholder="Ex: Pago via transferência bancária, comprovante enviado via WhatsApp..."
                                    value={billingNotes}
                                    onChange={e => setBillingNotes(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="p-10 bg-slate-50 border-t border-slate-100 flex gap-4">
                            <button onClick={() => setIsInvoiceModalOpen(false)} className="flex-1 py-5 text-[11px] font-black uppercase text-slate-400 hover:text-slate-600 tracking-widest">Cancelar</button>
                            <button
                                onClick={confirmInvoice}
                                disabled={isProcessing}
                                className="flex-[2] py-5 bg-emerald-600 text-white rounded-[2rem] font-black uppercase text-xs italic tracking-widest shadow-xl shadow-emerald-600/20 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50"
                            >
                                {isProcessing ? 'Processando...' : 'Confirmar Pagamento'} <Check size={18} className="inline ml-1" />
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Estilos Globais para Tailwind/CSS (Simulando Framer Motion) */}
            <style>{`
                @keyframes slideInRight {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
                .animate-slide-in-right {
                    animation: slideInRight 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                }
                .custom-scrollbar::-webkit-scrollbar {
                    width: 6px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: #e2e8f0;
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: #cbd5e1;
                }
            `}</style>
        </div>
    );
};
