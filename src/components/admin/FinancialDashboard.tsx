import React, { useState, useMemo, useEffect } from 'react';
import { ServiceOrder, OrderStatus, User, Quote } from '../../types';
import {
    Search, Filter, Download, Plus, ChevronRight, X, DollarSign, Calendar, Users,
    CreditCard, ArrowRight, CheckCircle2, FileText, Printer, ShieldCheck, MapPin,
    Layout as Layer, Info, UserCheck, Wallet, Smartphone, Layers, Wrench, Check, ArrowUpRight,
    TrendingUp, Clock, FileSpreadsheet, ChevronLeft
} from 'lucide-react';
import { Pagination } from '../ui/Pagination';
import { NexusBranding } from '../ui/NexusBranding';
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

    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 12;

    // Linking logic
    const availableQuotesForClient = useMemo(() => {
        if (!selectedItem || selectedItem.type !== 'ORDER') return [];
        return quotes.filter(q =>
            q.customerName === selectedItem.customerName &&
            (q.status === 'APROVADO' || q.status === 'CONVERTIDO') &&
            !selectedItem.original.linkedQuotes?.includes(q.id)
        );
    }, [selectedItem, quotes]);

    const handleLinkQuote = async (quoteId: string) => {
        if (!selectedItem || selectedItem.type !== 'ORDER') return;
        setIsProcessing(true);
        try {
            const currentLinks = selectedItem.original.linkedQuotes || [];
            await DataService.updateOrder({
                ...selectedItem.original,
                linkedQuotes: [...currentLinks, quoteId]
            });
            await onRefresh();
            setSelectedItem((prev: any) => ({
                ...prev,
                value: prev.value + (quotes.find(q => q.id === quoteId)?.totalValue || 0),
                original: {
                    ...prev.original,
                    linkedQuotes: [...currentLinks, quoteId]
                }
            }));
        } catch (error) {
            console.error(error);
            alert("Erro ao vincular orçamento.");
        } finally {
            setIsProcessing(false);
        }
    };

    // 1. Preparar Dados Unificados
    const allItems = useMemo(() => {
        // IDs de orçamentos que já estão vinculados a alguma OS
        const linkedQuoteIds = new Set<string>();
        orders.forEach(o => o.linkedQuotes?.forEach(id => linkedQuoteIds.add(id)));

        // Orçamentos Aprovados (apenas os NÃO vinculados)
        const approvedQuotes = quotes
            .filter(q => (q.status === 'APROVADO' || q.status === 'CONVERTIDO') && !linkedQuoteIds.has(q.id))
            .map(q => ({
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
                technician: 'Administrador'
            }));

        // OS Concluídas
        const completedOrders = orders.filter(o => o.status === OrderStatus.COMPLETED).map(order => {
            const itemsValue = order.items?.reduce((acc, i) => acc + i.total, 0) || 0;
            let value = itemsValue || (order.formData as any)?.totalValue || (order.formData as any)?.price || 0;

            // Somar valores de orçamentos vinculados
            if (order.linkedQuotes && order.linkedQuotes.length > 0) {
                const linkedValues = order.linkedQuotes.reduce((acc, qId) => {
                    const quote = quotes.find(q => q.id === qId);
                    return acc + (Number(quote?.totalValue) || 0);
                }, 0);
                value += linkedValues;
            }

            const techObj = techs.find(t => t.id === order.assignedTo);

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
                technician: techObj?.name || order.assignedTo || 'N/A'
            };
        });

        return [...approvedQuotes, ...completedOrders].sort((a, b) =>
            new Date(b.date).getTime() - new Date(a.date).getTime()
        );
    }, [orders, quotes, techs]);

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
    }, [allItems, searchTerm, startDate, endDate, techFilter]);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, startDate, endDate, techFilter]);

    const paginatedItems = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        return filteredItems.slice(start, start + ITEMS_PER_PAGE);
    }, [filteredItems, currentPage]);

    const totalPages = Math.ceil(filteredItems.length / ITEMS_PER_PAGE);

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
        console.log('=== INICIANDO PROCESSO DE FATURAMENTO ===');
        console.log('Itens selecionados:', selectedIds);
        setIsProcessing(true);
        try {
            for (const id of selectedIds) {
                const item = filteredItems.find(i => i.id === id);
                if (!item) {
                    console.warn(`Item com ID ${id} não encontrado na lista filtrada.`);
                    continue;
                }

                console.log(`Processando item ${item.type} #${item.id.slice(0, 8)}`);

                if (item.type === 'ORDER') {
                    // Atualizar OS
                    const { error: orderError } = await DataService.getServiceClient().from('orders')
                        .update({
                            billing_status: 'PAID',
                            payment_method: paymentMethod,
                            billing_notes: billingNotes,
                            paid_at: new Date().toISOString()
                        })
                        .eq('id', item.id);

                    if (orderError) {
                        console.error(`Erro ao atualizar OS ${item.id}:`, orderError);
                        throw orderError;
                    }

                    // Atualizar Orçamentos Vinculados
                    if (item.original.linkedQuotes && item.original.linkedQuotes.length > 0) {
                        for (const qId of item.original.linkedQuotes) {
                            const { error: quoteError } = await DataService.getServiceClient().from('quotes')
                                .update({
                                    billing_status: 'PAID',
                                    payment_method: paymentMethod,
                                    billing_notes: `Faturado via O.S. #${item.id.slice(0, 8)}`,
                                    paid_at: new Date().toISOString()
                                })
                                .eq('id', qId);

                            if (quoteError) console.error(`Erro ao atualizar orçamento vinculado ${qId}:`, quoteError);
                        }
                    }
                } else {
                    // Atualizar Orçamento Direto
                    const { error: quoteError } = await DataService.getServiceClient().from('quotes')
                        .update({
                            billing_status: 'PAID',
                            payment_method: paymentMethod,
                            billing_notes: billingNotes,
                            paid_at: new Date().toISOString()
                        })
                        .eq('id', item.id);

                    if (quoteError) {
                        console.error(`Erro ao atualizar orçamento ${item.id}:`, quoteError);
                        throw quoteError;
                    }
                }

                // REGISTRAR NO FLUXO DE CAIXA
                console.log(`📊 Registrando entrada no fluxo de caixa para ${item.type} #${item.id}...`);
                try {
                    await DataService.registerCashFlow({
                        type: 'INCOME',
                        category: item.type === 'ORDER' ? 'Serviço (O.S.)' : 'Venda (Orçamento)',
                        amount: item.value,
                        description: `Faturamento de ${item.type === 'ORDER' ? 'O.S.' : 'Orçamento'} #${item.id.slice(0, 8)} - Cliente: ${item.customerName}`,
                        referenceId: item.id,
                        referenceType: item.type,
                        paymentMethod: paymentMethod,
                        entryDate: new Date().toISOString()
                    });
                    console.log(`✅ Fluxo de caixa registrado para ${item.type} #${item.id}`);
                } catch (cashFlowError) {
                    console.error(`⚠️ Erro ao registrar fluxo de caixa (continuando):`, cashFlowError);
                    // Não bloqueia o faturamento se o cash flow falhar
                }
            }

            console.log('✅ Faturamento concluído com sucesso!');
            alert(`✅ ${selectedIds.length} Itens faturados e registrados no fluxo de caixa!`);
            setSelectedIds([]);
            setIsInvoiceModalOpen(false);
            setIsSidebarOpen(false);
            await onRefresh();
        } catch (error: any) {
            console.error('❌ ERRO NO FATURAMENTO:', error);
            alert(`Erro ao processar faturamento: ${error.message || 'Verifique sua conexão e tente novamente.'}`);
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
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary-600 transition-colors" size={16} />
                    <input
                        type="text"
                        placeholder="Pesquisar por cliente, título ou protocolo..."
                        className="w-full bg-white border border-slate-200 rounded-md pl-10 pr-4 py-2 text-xs font-medium text-slate-700 outline-none focus:ring-2 focus:ring-primary-100 transition-all shadow-sm"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>

                <div className="flex bg-white border border-slate-200 rounded-md p-1 shadow-sm px-3 items-center">
                    <Calendar size={14} className="text-primary-500 mr-2" />
                    <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-transparent border-none text-[10px] font-bold uppercase text-slate-600 outline-none cursor-pointer w-full" />
                    <span className="text-slate-300 mx-1">-</span>
                    <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-transparent border-none text-[10px] font-bold uppercase text-slate-600 outline-none cursor-pointer w-full" />
                </div>

                <div className="flex bg-white border border-slate-200 rounded-md p-1 shadow-sm px-3 items-center">
                    <UserCheck size={14} className="text-primary-500 mr-2" />
                    <select
                        className="bg-transparent text-[10px] font-bold uppercase text-slate-600 outline-none cursor-pointer w-full h-full py-1.5"
                        value={techFilter}
                        onChange={e => setTechFilter(e.target.value)}
                    >
                        <option value="ALL">Técnicos</option>
                        {techs.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                        <option value="Administrador">Admin</option>
                    </select>
                </div>
            </div>

            {/* Stats Bar */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-2 px-2">
                <div className="bg-white border border-slate-100 p-4 rounded-[2rem] shadow-sm flex items-center gap-4 transition-all hover:shadow-md">
                    <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shadow-sm">
                        <DollarSign size={20} />
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Total Recebido</p>
                        <h3 className="text-lg font-black text-emerald-600 leading-none">{formatCurrency(stats.totalFaturado)}</h3>
                    </div>
                </div>

                <div className="bg-white border border-slate-100 p-4 rounded-[2rem] shadow-sm flex items-center gap-4 transition-all hover:shadow-md">
                    <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shadow-sm">
                        <Clock size={20} />
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Pendente</p>
                        <h3 className="text-lg font-black text-slate-800 leading-none">{formatCurrency(stats.totalPendente)}</h3>
                    </div>
                </div>

                <div className="bg-white border border-slate-100 p-4 rounded-[2rem] shadow-sm flex items-center gap-4 transition-all hover:shadow-md">
                    <div className="w-10 h-10 rounded-2xl bg-primary-50 text-primary-600 flex items-center justify-center shadow-sm">
                        <TrendingUp size={20} />
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Ticket Médio</p>
                        <h3 className="text-lg font-black text-slate-800 leading-none">{formatCurrency(filteredItems.length > 0 ? (stats.totalFaturado + stats.totalPendente) / filteredItems.length : 0)}</h3>
                    </div>
                </div>

                <div className="bg-white border border-slate-100 p-4 rounded-[2rem] shadow-sm flex items-center gap-4 transition-all hover:shadow-md">
                    <div className="w-10 h-10 rounded-2xl bg-slate-50 text-slate-600 flex items-center justify-center shadow-sm">
                        <UserCheck size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Top Faturamento</p>
                        <h3 className="text-sm font-black text-slate-800 truncate uppercase mt-0.5">{stats.topTech[0]}</h3>
                    </div>
                </div>
            </div>

            {/* List Table */}
            <div className="bg-white border border-slate-100 rounded-[2rem] flex flex-col overflow-hidden flex-1 min-h-0 shadow-2xl shadow-slate-200/40 relative">
                <div className="absolute top-6 right-10 z-20">
                    <button
                        onClick={handleExportExcel}
                        className="flex items-center gap-2 px-6 py-3 bg-emerald-50 text-emerald-600 rounded-xl text-[10px] font-black uppercase hover:bg-emerald-600 hover:text-white transition-all shadow-sm border border-emerald-100/50"
                    >
                        <FileSpreadsheet size={16} /> Extrair Excel
                    </button>
                </div>

                <div className="flex-1 overflow-auto custom-scrollbar">
                    <table className="w-full text-left border-separate border-spacing-y-0">
                        <thead className="sticky top-0 bg-white/80 backdrop-blur-md z-10">
                            <tr className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">
                                <th className="px-3 py-6 w-12 text-center">
                                    <input
                                        type="checkbox"
                                        className="w-4 h-4 rounded border-slate-200 text-primary-600 focus:ring-primary-100 cursor-pointer transition-all active:scale-90"
                                        checked={filteredItems.length > 0 && selectedIds.length === filteredItems.length}
                                        onChange={() => {
                                            if (selectedIds.length === filteredItems.length) setSelectedIds([]);
                                            else setSelectedIds(filteredItems.map(i => i.id));
                                        }}
                                    />
                                </th>
                                <th className="px-4 py-6 border-b border-slate-100">Documento / Cliente</th>
                                <th className="px-4 py-6 border-b border-slate-100">Descrição</th>
                                <th className="px-4 py-6 border-b border-slate-100 italic">Técnico</th>
                                <th className="px-4 py-6 border-b border-slate-100">Valor</th>
                                <th className="px-4 py-6 text-center border-b border-slate-100">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {paginatedItems.map(item => (
                                <tr
                                    key={item.id}
                                    className={`group hover:bg-primary-50/40 transition-all cursor-pointer border-b last:border-0 border-slate-50 ${selectedIds.includes(item.id) ? 'bg-primary-50/50' : 'bg-white'}`}
                                    onClick={() => {
                                        setSelectedItem(item);
                                        setIsSidebarOpen(true);
                                    }}
                                >
                                    <td className="px-3 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                                        <input
                                            type="checkbox"
                                            className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                                            checked={selectedIds.includes(item.id)}
                                            onChange={() => toggleSelect(item.id)}
                                        />
                                    </td>
                                    <td className="px-4 py-4">
                                        <div className="flex flex-col truncate max-w-[150px]">
                                            <span className={`text-[8px] font-black px-1.5 py-0.5 rounded w-fit mb-1 ${item.type === 'QUOTE' ? 'bg-primary-50 text-primary-600 border border-primary-100' : 'bg-slate-100 text-slate-600 border border-slate-200'}`}>
                                                {item.type === 'QUOTE' ? 'ORC' : 'OS'}#{item.id.slice(0, 8)}
                                            </span>
                                            <p className="text-xs font-bold text-slate-800 tracking-tight truncate italic">{item.customerName}</p>
                                        </div>
                                    </td>
                                    <td className="px-4 py-4">
                                        <p className="text-[10px] text-slate-600 line-clamp-1 truncate max-w-[180px] uppercase font-bold italic tracking-tighter">{item.title}</p>
                                        <p className="text-[9px] text-slate-400 truncate mt-0.5">{new Date(item.date).toLocaleDateString()}</p>
                                    </td>
                                    <td className="px-4 py-4">
                                        <span className="text-[10px] font-black text-slate-700 capitalize truncate max-w-[100px] inline-block">{item.technician?.toLowerCase()}</span>
                                    </td>
                                    <td className="px-4 py-4 whitespace-nowrap">
                                        <span className="text-xs font-black text-slate-900">{formatCurrency(item.value)}</span>
                                    </td>
                                    <td className="px-4 py-4 text-center whitespace-nowrap">
                                        <div className={`inline-flex items-center px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest ${item.status === 'PAID' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-amber-50 text-amber-600 border border-amber-100'}`}>
                                            {item.status === 'PAID' ? 'Pago' : 'Pendente'}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    totalItems={filteredItems.length}
                    itemsPerPage={ITEMS_PER_PAGE}
                    onPageChange={setCurrentPage}
                />
            </div>

            {/* Somatório Flutuante */}
            {selectedIds.length > 0 && (
                <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[100] animate-fade-in-up">
                    <div className="bg-slate-900/90 backdrop-blur-xl border border-white/20 px-10 py-5 rounded-[3rem] shadow-[0_20px_50px_rgba(0,0,0,0.3)] flex items-center gap-10">
                        <div className="flex flex-col">
                            <p className="text-[9px] font-medium text-primary-400 uppercase tracking-widest leading-none mb-1">Selecionados</p>
                            <p className="text-lg font-bold text-white uppercase tracking-tight">{selectedIds.length} Itens</p>
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

            {/* Sidebar de Detalhes (Grande/XL) */}
            {isSidebarOpen && selectedItem && (
                <div className="fixed inset-0 z-[1200] bg-slate-900/60 backdrop-blur-md flex justify-end animate-fade-in p-4 sm:p-6 lg:p-8">
                    <div className="bg-white w-full max-w-5xl h-full shadow-2xl flex flex-col animate-slide-in-right rounded-[3rem] border border-white/50 overflow-hidden">
                        {/* Header */}
                        <div className="p-10 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                            <div className="flex items-center gap-6">
                                <div className={`w-16 h-16 rounded-[2rem] flex items-center justify-center shadow-lg ${selectedItem.type === 'QUOTE' ? 'bg-primary-600 text-white shadow-primary-500/20' : 'bg-primary-600 text-white shadow-primary-500/20'}`}>
                                    {selectedItem.type === 'QUOTE' ? <FileText size={32} /> : <Wrench size={32} />}
                                </div>
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className={`text-[9px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-md ${selectedItem.status === 'PAID' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                                            {selectedItem.status === 'PAID' ? 'Faturado' : 'Pendente'}
                                        </span>
                                        <span className="text-[9px] font-medium text-slate-400 uppercase tracking-widest bg-slate-100 px-2 py-1 rounded-md">{selectedItem.type === 'QUOTE' ? 'Orçamento' : 'O.S'}</span>
                                    </div>
                                    <h2 className="text-2xl font-bold text-slate-900 tracking-tight leading-none">#{selectedItem.id.slice(0, 12)}</h2>
                                </div>
                            </div>
                            <button onClick={() => setIsSidebarOpen(false)} className="p-4 bg-slate-50 text-slate-400 hover:text-rose-500 rounded-2xl shadow-sm border border-slate-100 transition-all hover:rotate-90">
                                <X size={24} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-10 custom-scrollbar">
                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                                {/* Coluna Esquerda: Dados Cliente/Serviço */}
                                <div className="lg:col-span-7 space-y-10">
                                    <section>
                                        <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                                            <Users size={14} className="text-primary-500" /> Identificação do Cliente
                                        </h4>
                                        <div className="p-8 bg-slate-50 rounded-[2.5rem] border border-slate-100/50">
                                            <p className="text-2xl font-black text-slate-900 uppercase italic mb-1">{selectedItem.customerName}</p>
                                            <p className="text-xs text-slate-500 font-bold uppercase tracking-tight flex items-center gap-2">
                                                <MapPin size={14} className="text-slate-300" /> {selectedItem.customerAddress}
                                            </p>
                                        </div>
                                    </section>

                                    <section>
                                        <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                                            <Info size={14} className="text-primary-500" /> Descrição do Atendimento
                                        </h4>
                                        <div className="space-y-4">
                                            <div className="p-8 bg-white border border-slate-100 rounded-[2.5rem] shadow-sm">
                                                <p className="text-sm font-black text-slate-800 uppercase italic mb-3">{selectedItem.title}</p>
                                                <p className="text-xs text-slate-500 font-medium leading-relaxed">{selectedItem.description}</p>
                                            </div>
                                            <div className="flex items-center gap-4 p-6 bg-primary-50/30 border border-primary-100/50 rounded-3xl">
                                                <div className="w-10 h-10 rounded-xl bg-primary-600 flex items-center justify-center text-white shadow-md">
                                                    <UserCheck size={18} />
                                                </div>
                                                <div>
                                                    <p className="text-[9px] font-black text-primary-400 uppercase tracking-widest">Técnico Responsável</p>
                                                    <p className="text-sm font-black text-slate-800 uppercase italic">{selectedItem.technician}</p>
                                                </div>
                                            </div>
                                        </div>
                                    </section>

                                    {selectedItem.type === 'ORDER' && (
                                        <section>
                                            <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                                                <Layer size={14} className="text-primary-500" /> Orçamentos Vinculados
                                            </h4>

                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                {selectedItem.original.linkedQuotes?.map((qId: string) => {
                                                    const q = quotes.find(quote => quote.id === qId);
                                                    return q ? (
                                                        <div key={qId} className="p-6 bg-white border border-slate-100 rounded-3xl flex flex-col shadow-sm group hover:border-primary-200 transition-all">
                                                            <div className="flex justify-between items-start mb-3">
                                                                <span className="text-[9px] font-bold text-primary-600 bg-primary-50 px-2 py-0.5 rounded-lg uppercase">#ORC-{qId.slice(0, 6)}</span>
                                                                <span className="text-sm font-black text-slate-900 italic">{formatCurrency(q.totalValue)}</span>
                                                            </div>
                                                            <p className="text-[11px] font-bold text-slate-700 uppercase italic truncate">{q.title}</p>
                                                        </div>
                                                    ) : null;
                                                })}

                                                {(!selectedItem.original.linkedQuotes || selectedItem.original.linkedQuotes.length === 0) && (
                                                    <div className="col-span-full py-8 text-center bg-slate-50 rounded-[2rem] border border-dashed border-slate-200">
                                                        <p className="text-[10px] text-slate-400 font-bold uppercase italic">Nenhum orçamento consolidado nesta OS</p>
                                                    </div>
                                                )}

                                                {availableQuotesForClient.length > 0 && selectedItem.status === 'PENDING' && (
                                                    <div className="col-span-full">
                                                        <p className="text-[9px] font-black text-slate-400 uppercase mb-3 text-center italic">Disponível para vínculo:</p>
                                                        <div className="flex flex-wrap gap-2 justify-center">
                                                            {availableQuotesForClient.map(q => (
                                                                <button
                                                                    key={q.id}
                                                                    onClick={() => handleLinkQuote(q.id)}
                                                                    disabled={isProcessing}
                                                                    className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl flex items-center gap-3 hover:border-primary-400 hover:bg-primary-50 transition-all"
                                                                >
                                                                    <div className="text-left">
                                                                        <p className="text-[10px] font-bold text-slate-700 uppercase">#{q.id.slice(0, 6)} - {formatCurrency(q.totalValue)}</p>
                                                                    </div>
                                                                    <Plus size={14} className="text-primary-500" />
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </section>
                                    )}
                                </div>

                                {/* Coluna Direita: Resumo Financeiro */}
                                <div className="lg:col-span-5 space-y-8">
                                    <section className="bg-slate-900 rounded-[3rem] p-10 text-white shadow-2xl shadow-slate-900/40 relative overflow-hidden">
                                        <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/5 rounded-full blur-3xl"></div>
                                        <h4 className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em] mb-6">Resumo de Liquidação</h4>
                                        <div className="space-y-6">
                                            <div className="flex justify-between items-center text-white/60">
                                                <span className="text-[10px] font-black uppercase">Valor Principal</span>
                                                <span className="text-sm font-mono">{formatCurrency(selectedItem.value)}</span>
                                            </div>
                                            {selectedItem.original.linkedQuotes?.length > 0 && (
                                                <div className="flex justify-between items-center text-primary-400">
                                                    <span className="text-[10px] font-black uppercase">Orçamentos Vinculados</span>
                                                    <span className="text-sm font-mono">+{formatCurrency(selectedItem.original.linkedQuotes.reduce((acc: number, qId: string) => {
                                                        const q = quotes.find(quote => quote.id === qId);
                                                        return acc + (Number(q?.totalValue) || 0);
                                                    }, 0))}</span>
                                                </div>
                                            )}
                                            <div className="pt-6 border-t border-white/10 flex justify-between items-end">
                                                <div className="flex flex-col">
                                                    <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest leading-none mb-1">Total a Receber</span>
                                                    <span className="text-4xl font-black italic tracking-tighter leading-none">{formatCurrency(selectedItem.value)}</span>
                                                </div>
                                                <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
                                                    <DollarSign size={24} />
                                                </div>
                                            </div>
                                        </div>
                                    </section>

                                    <section>
                                        <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                                            <ArrowUpRight size={14} className="text-primary-500" /> Acesso Rápido
                                        </h4>
                                        <div className="grid grid-cols-1 gap-4">
                                            <button
                                                onClick={() => window.open(`${window.location.origin}${window.location.pathname}#/view-${selectedItem.type === 'QUOTE' ? 'quote' : 'order'}/${selectedItem.original.publicToken || selectedItem.id}`, '_blank')}
                                                className="w-full py-5 bg-primary-50 border border-primary-100 rounded-[2rem] flex items-center justify-between px-8 text-primary-700 hover:bg-primary-600 hover:text-white transition-all shadow-sm"
                                            >
                                                <span className="text-[10px] font-black uppercase tracking-widest italic">Visualizar Link Externo</span>
                                                <ArrowUpRight size={18} />
                                            </button>
                                            <button className="w-full py-5 bg-slate-50 border border-slate-200 rounded-[2rem] flex items-center justify-between px-8 text-slate-600 hover:bg-slate-900 hover:text-white transition-all shadow-sm">
                                                <span className="text-[10px] font-black uppercase tracking-widest italic">Gerar Espelho em PDF</span>
                                                <Printer size={18} />
                                            </button>
                                        </div>
                                    </section>

                                    {selectedItem.status === 'PAID' && (
                                        <section className="p-8 bg-emerald-50 border border-emerald-100 rounded-[2.5rem] space-y-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 bg-emerald-500 text-white rounded-xl flex items-center justify-center"><Check size={20} /></div>
                                                <p className="text-[11px] font-black text-emerald-800 uppercase italic">Baixa Realizada com Sucesso</p>
                                            </div>
                                            <div className="space-y-3">
                                                <div className="flex justify-between items-center py-2 border-b border-emerald-100/50">
                                                    <p className="text-[9px] font-black text-emerald-400 uppercase">Método</p>
                                                    <p className="text-xs font-black text-emerald-900 uppercase italic">{selectedItem.original.paymentMethod || 'Dinheiro'}</p>
                                                </div>
                                                <div className="flex justify-between items-center py-2 border-b border-emerald-100/50">
                                                    <p className="text-[9px] font-black text-emerald-400 uppercase">Data</p>
                                                    <p className="text-xs font-black text-emerald-900 uppercase italic">{selectedItem.original.paidAt ? new Date(selectedItem.original.paidAt).toLocaleDateString() : 'N/D'}</p>
                                                </div>
                                            </div>
                                        </section>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Footer Sidebar */}
                        <div className="p-10 border-t border-slate-100 bg-slate-50/50 flex gap-4">
                            <button onClick={() => setIsSidebarOpen(false)} className="px-8 py-5 border border-slate-200 rounded-[2rem] text-[11px] font-black uppercase text-slate-400 hover:text-slate-600 tracking-widest transition-all">Fechar</button>
                            {selectedItem.status === 'PENDING' ? (
                                <button
                                    onClick={() => {
                                        setSelectedIds([selectedItem.id]);
                                        setIsInvoiceModalOpen(true);
                                    }}
                                    className="flex-1 py-5 bg-emerald-600 text-white rounded-[2rem] font-black uppercase text-xs italic tracking-widest shadow-xl shadow-emerald-600/20 hover:scale-[1.02] active:scale-95 transition-all"
                                >
                                    Confirmar Recebimento <ChevronRight size={18} className="inline ml-1" />
                                </button>
                            ) : (
                                <div className="flex-1 py-5 bg-slate-50 border border-slate-100 text-slate-400 rounded-[2rem] font-black uppercase text-xs italic tracking-widest text-center flex items-center justify-center gap-2">
                                    <CheckCircle2 size={16} className="text-emerald-500" /> Registro Liquidado
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Checkout (PDV Professional) */}
            {isInvoiceModalOpen && (
                <div className="fixed inset-0 z-[2000] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
                    <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row border border-white/10">
                        {/* Coluna Left: Resumo (1/3) */}
                        <div className="md:w-1/3 bg-slate-50 border-r border-slate-200 p-8 flex flex-col justify-between">
                            <div>
                                <NexusBranding className="w-24 text-slate-300 mb-8" />
                                <h2 className="text-xl font-semibold text-slate-800 mb-1">Finalizar Venda</h2>
                                <p className="text-xs text-slate-500 uppercase tracking-wider mb-8">Resumo da Operação</p>

                                <div className="space-y-8">
                                    <div>
                                        <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider mb-2">Total</p>
                                        <div className="text-2xl font-bold text-slate-900 tracking-tight">
                                            {formatCurrency(selectedIds.length === 1 ? (selectedItem?.value || 0) : selectedTotal)}
                                        </div>
                                    </div>

                                    <div className="space-y-3 pt-6 border-t border-slate-200/60">
                                        <div className="flex justify-between items-center text-xs text-slate-600">
                                            <span>Registros Selecionados</span>
                                            <span className="font-semibold">{selectedIds.length} Itens</span>
                                        </div>
                                        <div className="flex justify-between items-center text-xs text-slate-600">
                                            <span>Cliente</span>
                                            <span className="font-semibold truncate max-w-[120px]">{selectedIds.length === 1 ? selectedItem?.customerName : 'Múltiplos'}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-xs text-slate-600">
                                            <span>Status Atual</span>
                                            <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-[10px] font-bold uppercase">Pendente</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="text-[10px] text-slate-400 font-medium flex items-center gap-2 mt-8">
                                <ShieldCheck size={14} className="text-emerald-500" />
                                <span className="uppercase tracking-wider">Ambiente Seguro</span>
                            </div>
                        </div>

                        {/* Coluna Right: Ações (2/3) */}
                        <div className="flex-1 p-8 bg-white flex flex-col h-full">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                                    <Wallet size={16} className="text-primary-500" /> Forma de Pagamento
                                </h3>
                                <button onClick={() => setIsInvoiceModalOpen(false)} className="text-slate-300 hover:text-rose-500 transition-colors p-2 hover:bg-rose-50 rounded-full">
                                    <X size={18} />
                                </button>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
                                {[
                                    { id: 'Pix', icon: <Smartphone size={18} />, label: 'Pix' },
                                    { id: 'Dinheiro', icon: <DollarSign size={18} />, label: 'Dinheiro' },
                                    { id: 'Cartão Débito', icon: <CreditCard size={18} />, label: 'Débito' },
                                    { id: 'Cartão Crédito 1x', icon: <CreditCard size={18} />, label: 'Crédito 1x' },
                                    { id: 'Cartão Parcelado', icon: <Layers size={18} />, label: 'Parcelado' },
                                    { id: 'Boleto', icon: <FileText size={18} />, label: 'Boleto' }
                                ].map(method => (
                                    <button
                                        key={method.id}
                                        onClick={() => setPaymentMethod(method.id)}
                                        className={`flex flex-col items-center justify-center p-4 border rounded-xl transition-all h-24 duration-200 ${paymentMethod === method.id
                                            ? 'border-primary-600 bg-primary-50 text-primary-700 ring-1 ring-primary-600 shadow-md transform scale-[1.02]'
                                            : 'border-slate-100 hover:border-primary-200 text-slate-500 hover:bg-slate-50 hover:text-primary-600'}`}
                                    >
                                        <div className="mb-2 opacity-80">{method.icon}</div>
                                        <span className="text-[10px] font-bold uppercase text-center leading-tight">{method.label}</span>
                                    </button>
                                ))}
                            </div>

                            <div className="mb-6 flex-1 flex flex-col">
                                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 pl-1">Observações / Comprovante</label>
                                <textarea
                                    className="w-full flex-1 min-h-[80px] bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-primary-500/10 focus:border-primary-500 transition-all resize-none placeholder:text-slate-400"
                                    placeholder="Opcional: Digite o número do comprovante ou notas sobre a transação..."
                                    value={billingNotes}
                                    onChange={e => setBillingNotes(e.target.value)}
                                />
                            </div>

                            <button
                                onClick={confirmInvoice}
                                disabled={isProcessing}
                                className="w-full py-3.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm font-bold uppercase tracking-wide shadow-lg shadow-primary-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                            >
                                {isProcessing ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                        <span>Processando...</span>
                                    </>
                                ) : (
                                    <>
                                        <span>Confirmar e Finalizar</span>
                                        <ArrowRight size={16} />
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

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
