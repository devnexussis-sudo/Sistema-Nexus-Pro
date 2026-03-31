import React, { useState, useMemo, useRef } from 'react';
import { ServiceOrder, OrderStatus, User, Quote } from '../../types';
import type { DbTenant } from '../../types/database';
import {
    Search, X, DollarSign, Calendar, Users,
    CreditCard, ArrowRight, CheckCircle2, FileText, Printer, ShieldCheck, MapPin,
    Layout as Layer, Info, UserCheck, Wallet, Smartphone, Layers, Wrench, Check, ArrowUpRight,
    TrendingUp, Clock, FileSpreadsheet, ChevronRight, Plus, Slash
} from 'lucide-react';
import { Pagination } from '../ui/Pagination';
import { NexusBranding } from '../ui/NexusBranding';
import { DataService } from '../../services/dataService';
import * as XLSX from 'xlsx';

interface FinancialDashboardProps {
    orders: ServiceOrder[];
    quotes: Quote[];
    techs: User[];
    tenant?: DbTenant | null;
    onRefresh: () => Promise<void>;
}

export const FinancialDashboard: React.FC<FinancialDashboardProps> = ({ orders, quotes, techs, tenant, onRefresh }) => {
    const printRef = useRef<HTMLDivElement>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [techFilter, setTechFilter] = useState('ALL');
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [selectedItem, setSelectedItem] = useState<any | null>(null);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    // Form de Baixa
    const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
    const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
    const [printItem, setPrintItem] = useState<any | null>(null);
    const [paymentMethod, setPaymentMethod] = useState('Dinheiro');
    const [installments, setInstallments] = useState(2);
    const [billingNotes, setBillingNotes] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);

    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 12;

    // Orçamentos disponíveis para vincular
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
            const isOrderPaid = selectedItem.status === 'PAID';
            const paidAt = selectedItem.original.paidAt || new Date().toISOString();
            const paymentMethod = selectedItem.original.paymentMethod || 'Vinculado a O.S. Faturada';

            // 1. Atualiza a O.S. com o novo vínculo
            await DataService.updateOrder({
                ...selectedItem.original,
                linkedQuotes: [...currentLinks, quoteId]
            });

            // 2. Se a O.S. já estiver faturada, fatura o orçamento automaticamente
            if (isOrderPaid) {
                const qOrigin = quotes.find(q => q.id === quoteId);
                if (qOrigin) {
                    await DataService.updateQuote({
                        ...qOrigin,
                        billingStatus: 'PAID',
                        paymentMethod: paymentMethod,
                        billingNotes: `Faturado via vínculo automático (O.S. ${selectedItem.displayId || selectedItem.id.slice(0,8)} já estava paga)`,
                        paidAt: paidAt
                    });

                    // Registra no fluxo de caixa o valor do orçamento vinculado
                    try {
                        await DataService.registerCashFlow({
                            type: 'INCOME',
                            category: 'Venda (Orçamento)',
                            amount: Number(qOrigin.totalValue) || 0,
                            description: `Faturamento automático (Vínculo) - Orçamento ${qOrigin.displayId || qOrigin.id.slice(0,8)} na O.S. ${selectedItem.displayId || selectedItem.id.slice(0,8)}`,
                            referenceId: qOrigin.id,
                            referenceType: 'QUOTE',
                            paymentMethod: paymentMethod,
                            entryDate: paidAt
                        });
                    } catch (e) { console.warn('Cash flow error (non-blocking):', e); }
                }
            }

            await onRefresh();
            setSelectedItem((prev: any) => ({
                ...prev,
                value: Number(prev.value) + Number(quotes.find(q => q.id === quoteId)?.totalValue || 0),
                original: { ...prev.original, linkedQuotes: [...currentLinks, quoteId] }
            }));
        } catch (error) {
            console.error(error);
            alert('Erro ao vincular orçamento.');
        } finally {
            setIsProcessing(false);
        }
    };

    // 1. Preparar Dados Unificados
    const allItems = useMemo(() => {
        const linkedQuoteIds = new Set<string>();
        orders.forEach(o => o.linkedQuotes?.forEach(id => linkedQuoteIds.add(id)));

        const approvedQuotes = quotes
            .filter(q => (q.status === 'APROVADO' || q.status === 'CONVERTIDO') && !linkedQuoteIds.has(q.id))
            .map(q => ({
                type: 'QUOTE' as const,
                id: q.id,
                displayId: q.displayId || null,
                customerName: q.customerName,
                customerAddress: q.customerAddress,
                title: q.title,
                description: q.description,
                date: q.createdAt,
                createdAt: q.createdAt,
                updatedAt: q.updatedAt || q.createdAt,
                paidAt: q.paidAt || null,
                value: Number(q.totalValue) || 0,
                status: (q.billingStatus || 'PENDING').toUpperCase(),
                original: q,
                technician: 'Administrador'
            }));

        const completedOrders = orders
            .filter(o => o.status === OrderStatus.COMPLETED)
            .map(order => {
                const itemsValue = order.items?.reduce((acc, i) => acc + i.total, 0) || 0;
                let value = Number(itemsValue || (order.formData as any)?.totalValue || (order.formData as any)?.price || 0);
                if (order.linkedQuotes && order.linkedQuotes.length > 0) {
                    value += order.linkedQuotes.reduce((acc, qId) => {
                        const q = quotes.find(q => q.id === qId);
                        return acc + (Number(q?.totalValue) || 0);
                    }, 0);
                }
                const techObj = techs.find(t => t.id === order.assignedTo);
                return {
                    type: 'ORDER' as const,
                    id: order.id,
                    displayId: order.displayId || null,
                    customerName: order.customerName,
                    customerAddress: order.customerAddress,
                    title: order.title,
                    description: order.description,
                    date: order.updatedAt,
                    createdAt: order.createdAt,
                    updatedAt: order.updatedAt,
                    paidAt: order.paidAt || null,
                    value: Number(value),
                    status: (order.billingStatus || 'PENDING').toUpperCase(),
                    original: order,
                    technician: techObj?.name || order.assignedTo || 'N/A'
                };
            })
            .filter(item => item.value > 0);

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
                item.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                item.displayId?.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesTech = techFilter === 'ALL' || item.technician === techFilter;
            const matchesStatus = statusFilter === 'ALL' || item.status === statusFilter;
            const matchesDate =
                (!startDate || itemDate >= startDate) &&
                (!endDate || itemDate <= endDate);
            return matchesSearch && matchesTech && matchesStatus && matchesDate;
        });
    }, [allItems, searchTerm, startDate, endDate, techFilter, statusFilter]);

    const paginatedItems = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        return filteredItems.slice(start, start + ITEMS_PER_PAGE);
    }, [filteredItems, currentPage]);

    const totalPages = Math.ceil(filteredItems.length / ITEMS_PER_PAGE);

    // 3. Estatísticas
    const stats = useMemo(() => {
        const totalFaturado = filteredItems.filter(i => i.status === 'PAID').reduce((acc, i) => acc + i.value, 0);
        const totalPendente = filteredItems.filter(i => i.status !== 'PAID').reduce((acc, i) => acc + i.value, 0);
        const techBilling: Record<string, number> = {};
        filteredItems.forEach(item => {
            techBilling[item.technician] = (techBilling[item.technician] || 0) + item.value;
        });
        const topTech = Object.entries(techBilling).sort((a, b) => b[1] - a[1])[0] || ['Nenhum', 0];
        return { totalFaturado, totalPendente, topTech };
    }, [filteredItems]);

    // 4. Seleção
    const toggleSelect = (id: string) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    };
    const selectedTotal = useMemo(() => {
        return filteredItems.filter(i => selectedIds.includes(i.id)).reduce((acc, i) => {
            if (selectedItem && selectedItem.id === i.id) return acc + Number(selectedItem.value);
            return acc + Number(i.value);
        }, 0);
    }, [filteredItems, selectedIds, selectedItem]);

    // 5. Handlers
    const handleInvoiceBatch = () => {
        if (selectedIds.length === 0) return;
        setIsInvoiceModalOpen(true);
    };

    const getPaymentMethodLabel = () => {
        if (paymentMethod === 'Cartão Crédito') return `Cartão Crédito ${installments}x`;
        return paymentMethod;
    };

    const confirmInvoice = async () => {
        setIsProcessing(true);
        const finalMethod = getPaymentMethodLabel();
        const paidAt = new Date().toISOString();
        try {
            for (const id of selectedIds) {
                // ─── Prioridade: usa selectedItem (estado mais atualizado) quando possível ───
                // Isso garante que orçamentos recém-vinculados via handleLinkQuote sejam incluídos
                // mesmo antes do onRefresh() reconstruir filteredItems.
                const rawItem = filteredItems.find(i => i.id === id);
                if (!rawItem) continue;

                // Mescla linkedQuotes do selectedItem se este for o item sendo faturado
                const item = (selectedItem && selectedItem.id === id)
                    ? {
                        ...rawItem,
                        value: selectedItem.value,
                        original: {
                            ...rawItem.original,
                            linkedQuotes: selectedItem.original?.linkedQuotes ?? rawItem.original?.linkedQuotes
                        }
                    }
                    : rawItem;

                if (item.type === 'ORDER') {
                    // Atualiza O.S. principal
                    await DataService.updateOrder({
                        ...item.original,
                        billingStatus: 'PAID',
                        paymentMethod: finalMethod,
                        billingNotes: billingNotes,
                        paidAt
                    });

                    // Atualiza TODOS os orçamentos vinculados (incluindo os recém-linkados)
                    const linkedQuoteIds: string[] = item.original.linkedQuotes ?? [];
                    console.log(`[FinancialDashboard] Faturando O.S. ${item.displayId} com ${linkedQuoteIds.length} orçamento(s) vinculado(s):`, linkedQuoteIds);
                    for (const qId of linkedQuoteIds) {
                        const qOrigin = quotes.find(q => q.id === qId);
                        if (qOrigin) {
                            await DataService.updateQuote({
                                ...qOrigin,
                                billingStatus: 'PAID',
                                paymentMethod: finalMethod,
                                billingNotes: `Faturado via O.S. ${item.displayId || '#' + item.id.slice(0, 8)}`,
                                paidAt
                            });
                        }
                    }
                } else {
                    // Orçamento autônomo faturado
                    await DataService.updateQuote({
                        ...item.original,
                        billingStatus: 'PAID',
                        paymentMethod: finalMethod,
                        billingNotes: billingNotes,
                        paidAt
                    });
                }

                // Registra no fluxo de caixa
                try {
                    await DataService.registerCashFlow({
                        type: 'INCOME',
                        category: item.type === 'ORDER' ? 'Serviço (O.S.)' : 'Venda (Orçamento)',
                        amount: item.value,
                        description: `Faturamento de ${item.type === 'ORDER' ? 'O.S.' : 'Orçamento'} ${item.displayId || '#' + item.id.slice(0, 8)} — Cliente: ${item.customerName}`,
                        referenceId: item.id,
                        referenceType: item.type,
                        paymentMethod: finalMethod,
                        entryDate: paidAt
                    });
                } catch (e) { console.warn('Cash flow error (non-blocking):', e); }
            }

            // Atualiza UI imediatamente
            if (selectedItem && selectedIds.includes(selectedItem.id)) {
                setSelectedItem((prev: any) => prev ? ({
                    ...prev,
                    status: 'PAID',
                    original: { ...prev.original, billingStatus: 'PAID', paymentMethod: finalMethod, paidAt }
                }) : null);
            }

            setSelectedIds([]);
            setIsInvoiceModalOpen(false);
            setPaymentMethod('Dinheiro');
            setBillingNotes('');
            await onRefresh();
        } catch (error: any) {
            alert(`Erro ao processar faturamento: ${error.message}`);
        } finally {
            setIsProcessing(false);
        }
    };

    // ── Handler de Impressão ──────────────────────────────────────────────────
    const handlePrint = (item: any) => {
        setPrintItem(item);
        setIsPrintModalOpen(true);
    };

    const executePrint = () => {
        window.print();
    };

    const handleExportExcel = () => {
        if (filteredItems.length === 0) return;
        const exportData = filteredItems.map(item => ({
            ID: item.displayId || item.id,
            Tipo: item.type === 'ORDER' ? 'O.S.' : 'Orçamento',
            Data: new Date(item.date).toLocaleDateString('pt-BR'),
            Cliente: item.customerName,
            Título: item.title,
            Técnico: item.technician,
            Valor: item.value,
            Status: item.status === 'PAID' ? 'Faturado' : 'Pendente'
        }));
        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Financeiro');
        XLSX.writeFile(wb, `financeiro_nexus_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    const formatCurrency = (val: number) =>
        new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

    const getDocLabel = (item: any) => {
        if (item.type === 'QUOTE') return item.displayId || `ORC-${item.id.slice(0, 8).toUpperCase()}`;
        return item.displayId || `OS-${item.id.slice(0, 8).toUpperCase()}`;
    };

    const paymentMethods = [
        { id: 'Pix', icon: <Smartphone size={20} />, label: 'Pix' },
        { id: 'Dinheiro', icon: <DollarSign size={20} />, label: 'Dinheiro' },
        { id: 'Cartão Débito', icon: <CreditCard size={20} />, label: 'Débito' },
        { id: 'Cartão Crédito', icon: <CreditCard size={20} />, label: 'Crédito' },
        { id: 'Boleto', icon: <FileText size={20} />, label: 'Boleto' },
        { id: 'Transferência', icon: <ArrowRight size={20} />, label: 'Transferência' },
    ];

    return (
        <div className="p-4 animate-fade-in flex flex-col h-full bg-slate-50/20 overflow-hidden relative font-sans">

            {/* ── FILTROS + STATS ── */}
            <div className="flex-shrink-0 space-y-4 mb-4">
                {/* Filtros */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                    <div className="md:col-span-4 relative group">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#1c2d4f] transition-colors" size={15} />
                        <input
                            type="text"
                            placeholder="Pesquisar por cliente, protocolo ou ORC..."
                            className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 text-xs font-medium text-slate-700 outline-none focus:ring-2 focus:ring-[#1c2d4f]/10 transition-all shadow-sm"
                            value={searchTerm}
                            onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                        />
                    </div>
                    <div className="md:col-span-4 flex bg-white border border-slate-200 rounded-xl shadow-sm px-3 items-center gap-2">
                        <Calendar size={13} className="text-[#1c2d4f] shrink-0" />
                        <input type="date" value={startDate} onChange={e => { setStartDate(e.target.value); setCurrentPage(1); }} className="bg-transparent border-none text-[10px] font-bold uppercase text-slate-600 outline-none cursor-pointer w-full py-2" />
                        <Slash size={10} className="text-slate-300 shrink-0" />
                        <input type="date" value={endDate} onChange={e => { setEndDate(e.target.value); setCurrentPage(1); }} className="bg-transparent border-none text-[10px] font-bold uppercase text-slate-600 outline-none cursor-pointer w-full py-2" />
                    </div>
                    <div className="md:col-span-2 flex bg-white border border-slate-200 rounded-xl shadow-sm px-3 items-center gap-2">
                        <UserCheck size={13} className="text-[#1c2d4f] shrink-0" />
                        <select className="bg-transparent text-[10px] font-bold uppercase text-slate-600 outline-none cursor-pointer w-full py-2.5" value={techFilter} onChange={e => { setTechFilter(e.target.value); setCurrentPage(1); }}>
                            <option value="ALL">Técnicos (Todos)</option>
                            {techs.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                            <option value="Administrador">Admin</option>
                        </select>
                    </div>
                    <div className="md:col-span-2 flex bg-white border border-slate-200 rounded-xl shadow-sm px-3 items-center gap-2">
                        <Layer size={13} className="text-[#1c2d4f] shrink-0" />
                        <select className="bg-transparent text-[10px] font-bold uppercase text-slate-600 outline-none cursor-pointer w-full py-2.5" value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setCurrentPage(1); }}>
                            <option value="ALL">Status (Todos)</option>
                            <option value="PENDING">Pendente</option>
                            <option value="PAID">Faturado</option>
                        </select>
                    </div>
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {[
                        { label: 'Total Recebido', value: formatCurrency(stats.totalFaturado), icon: <DollarSign size={18} />, color: 'from-emerald-500 to-emerald-600', textMain: 'text-white' },
                        { label: 'A Receber', value: formatCurrency(stats.totalPendente), icon: <Clock size={18} />, color: 'from-amber-500 to-amber-600', textMain: 'text-white' },
                        { label: 'Ticket Médio', value: formatCurrency(filteredItems.length > 0 ? (stats.totalFaturado + stats.totalPendente) / filteredItems.length : 0), icon: <TrendingUp size={18} />, color: 'from-[#1c2d4f] to-[#2a457a]', textMain: 'text-white' },
                        { label: 'Top Faturador', value: stats.topTech[0]?.toString() || '—', icon: <UserCheck size={18} />, color: 'from-slate-700 to-slate-900', textMain: 'text-white', truncate: true },
                    ].map((stat, i) => (
                        <div key={i} className={`bg-gradient-to-br ${stat.color} rounded-2xl p-4 shadow-lg flex items-center gap-4`}>
                            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center text-white shrink-0">
                                {stat.icon}
                            </div>
                            <div className="min-w-0">
                                <p className="text-[9px] font-black text-white/60 uppercase tracking-wider leading-none mb-1">{stat.label}</p>
                                <p className={`text-sm font-black ${stat.textMain} leading-none ${stat.truncate ? 'truncate' : ''}`}>{stat.value}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* ── TABELA ── */}
            <div className="bg-white border border-slate-100 rounded-2xl flex flex-col overflow-hidden flex-1 min-h-0 shadow-xl shadow-slate-200/30 relative">
                <div className="absolute top-4 right-4 z-20">
                    <button onClick={handleExportExcel} className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl text-[10px] font-black uppercase hover:bg-emerald-600 hover:text-white transition-all shadow-sm border border-emerald-100">
                        <FileSpreadsheet size={14} /> Excel
                    </button>
                </div>
                <div className="flex-1 overflow-auto">
                    <table className="w-full text-left">
                        <thead className="sticky top-0 bg-white/95 backdrop-blur-md z-10 border-b border-slate-100">
                            <tr className="text-[9px] font-black text-slate-400 uppercase tracking-[0.3em]">
                                <th className="px-3 py-3 w-10 text-center">
                                    <input type="checkbox" className="w-3.5 h-3.5 rounded border-slate-200 text-[#1c2d4f] cursor-pointer" checked={filteredItems.length > 0 && selectedIds.length === filteredItems.length} onChange={() => { if (selectedIds.length === filteredItems.length) setSelectedIds([]); else setSelectedIds(filteredItems.map(i => i.id)); }} />
                                </th>
                                <th className="px-4 py-3">Protocolo</th>
                                <th className="px-4 py-3">Cliente</th>
                                <th className="px-4 py-3">Descrição</th>
                                <th className="px-4 py-3">Técnico</th>
                                <th className="px-4 py-3">Data</th>
                                <th className="px-4 py-3">Pgto</th>
                                <th className="px-4 py-3">Valor</th>
                                <th className="px-4 py-3 text-center">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {paginatedItems.length === 0 ? (
                                <tr>
                                    <td colSpan={9} className="py-16 text-center">
                                        <DollarSign size={32} className="text-slate-200 mx-auto mb-3" />
                                        <p className="text-xs font-black text-slate-300 uppercase tracking-widest">Nenhum lançamento encontrado</p>
                                    </td>
                                </tr>
                            ) : paginatedItems.map(item => (
                                <tr
                                    key={item.id}
                                    className={`group hover:bg-[#1c2d4f]/5 transition-all cursor-pointer ${selectedIds.includes(item.id) ? 'bg-[#1c2d4f]/5' : 'bg-white'}`}
                                    onClick={() => { setSelectedItem(item); setIsSidebarOpen(true); }}
                                >
                                    <td className="px-3 py-2.5 text-center" onClick={e => e.stopPropagation()}>
                                        <input type="checkbox" className="w-3.5 h-3.5 rounded border-slate-300 text-[#1c2d4f] cursor-pointer" checked={selectedIds.includes(item.id)} onChange={() => toggleSelect(item.id)} />
                                    </td>
                                    <td className="px-4 py-2.5">
                                        <span className={`text-[9px] font-black px-2 py-0.5 rounded-lg w-fit whitespace-nowrap ${item.type === 'QUOTE' ? 'bg-[#1c2d4f]/10 text-[#1c2d4f]' : 'bg-slate-100 text-slate-600'}`}>
                                            {getDocLabel(item)}
                                        </span>
                                    </td>
                                    <td className="px-4 py-2.5">
                                        <p className="text-[11px] font-bold text-slate-800 truncate max-w-[150px] uppercase">{item.customerName}</p>
                                    </td>
                                    <td className="px-4 py-2.5">
                                        <p className="text-[10px] text-slate-600 truncate max-w-[180px] font-bold uppercase">{item.title}</p>
                                    </td>
                                    <td className="px-4 py-2.5">
                                        <span className="text-[10px] font-bold text-slate-700 capitalize">{item.technician?.toLowerCase()}</span>
                                    </td>
                                    <td className="px-4 py-2.5">
                                        <div className="flex flex-col gap-0.5">
                                            <span className="text-[10px] font-bold text-slate-600 whitespace-nowrap">{new Date(item.date).toLocaleDateString('pt-BR')}</span>
                                            <span className="text-[8px] text-slate-400 font-black uppercase tracking-wider">{item.type === 'QUOTE' ? 'Criação' : 'Conclusão'}</span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-2.5">
                                        <div className="flex flex-col gap-0.5">
                                            {item.paidAt ? (
                                                <>
                                                    <span className="text-[10px] font-bold text-emerald-600 whitespace-nowrap">{new Date(item.paidAt).toLocaleDateString('pt-BR')}</span>
                                                    <span className="text-[8px] text-emerald-400 font-black uppercase tracking-wider">Faturado</span>
                                                </>
                                            ) : (
                                                <span className="text-[10px] font-bold text-slate-400">—</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-4 py-2.5">
                                        <span className="text-sm font-black text-slate-900">{formatCurrency(item.value)}</span>
                                    </td>
                                    <td className="px-4 py-2.5 text-center">
                                        <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wide ${item.status === 'PAID' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                                            <span className={`w-1.5 h-1.5 rounded-full ${item.status === 'PAID' ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`} />
                                            {item.status === 'PAID' ? 'Faturado' : 'Pendente'}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <Pagination currentPage={currentPage} totalPages={totalPages} totalItems={filteredItems.length} itemsPerPage={ITEMS_PER_PAGE} onPageChange={setCurrentPage} />
            </div>

            {/* ── SOMATÓRIO FLUTUANTE ── */}
            {selectedIds.length > 0 && (
                <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] animate-fade-in-up">
                    <div className="bg-slate-900/95 backdrop-blur-xl border border-white/10 px-8 py-4 rounded-[2rem] shadow-[0_20px_60px_rgba(0,0,0,0.4)] flex items-center gap-8">
                        <div>
                            <p className="text-[9px] font-black text-white/40 uppercase tracking-widest mb-0.5">Selecionados</p>
                            <p className="text-base font-black text-white">{selectedIds.length} Itens</p>
                        </div>
                        <div className="h-8 w-px bg-white/10" />
                        <div>
                            <p className="text-[9px] font-black text-emerald-400/70 uppercase tracking-widest mb-0.5">Total</p>
                            <p className="text-xl font-black text-emerald-400">{formatCurrency(selectedTotal)}</p>
                        </div>
                        <button onClick={handleInvoiceBatch} className="bg-emerald-500 hover:bg-emerald-400 text-white px-8 py-3 rounded-xl font-black uppercase text-[11px] tracking-widest shadow-xl shadow-emerald-500/30 transition-all hover:scale-105 flex items-center gap-2">
                            Faturar <ChevronRight size={16} />
                        </button>
                        <button onClick={() => setSelectedIds([])} className="p-2 text-white/30 hover:text-white transition-all">
                            <X size={20} />
                        </button>
                    </div>
                </div>
            )}

            {/* ── PAINEL DE DETALHES (Centrado no meio) ── */}
            {isSidebarOpen && selectedItem && (
                <div className="fixed inset-0 z-[1200] bg-slate-900/60 backdrop-blur-sm flex justify-center items-center py-4 px-4 overflow-y-auto animate-fade-in" onClick={() => setIsSidebarOpen(false)}>
                    <div className="bg-slate-50 w-full max-w-2xl min-h-[500px] max-h-full rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.3)] flex flex-col overflow-hidden relative" onClick={e => e.stopPropagation()}>

                        {/* Hero Header — padrão OS */}
                        <div className={`${selectedItem.status === 'PAID' ? 'bg-emerald-700' : 'bg-[#1c2d4f]'} transition-colors`}>
                            <div className="px-6 py-5 flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center border border-white/10">
                                        {selectedItem.type === 'QUOTE' ? <FileText size={22} className="text-white" /> : <Wrench size={22} className="text-white" />}
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-bold text-white/50 tracking-wider mb-1 capitalize">{selectedItem.type === 'QUOTE' ? 'Orçamento' : 'Ordem de Serviço'}</p>
                                        <h2 className="text-xl font-black text-white uppercase tracking-tight leading-none">#{getDocLabel(selectedItem)}</h2>
                                        {selectedItem.title && <p className="text-xs font-medium text-white/80 mt-1 capitalize">{selectedItem.title}</p>}
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border flex items-center gap-2 ${selectedItem.status === 'PAID' ? 'bg-emerald-500/20 text-emerald-200 border-emerald-500/30' : 'bg-amber-500/20 text-amber-300 border-amber-500/30'}`}>
                                        <span className={`w-1.5 h-1.5 rounded-full ${selectedItem.status === 'PAID' ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'}`} />
                                        {selectedItem.status === 'PAID' ? 'Faturado' : 'Pendente'}
                                    </div>
                                    <button onClick={() => setIsSidebarOpen(false)} className="p-2.5 bg-white/10 hover:bg-white/20 rounded-xl text-white transition-all hover:rotate-90">
                                        <X size={20} />
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Corpo principal */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-5">

                            {/* Cards de Informação */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* Cliente */}
                                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                                    <div className="flex items-center gap-2 pb-3 border-b border-slate-50 mb-4">
                                        <div className="w-7 h-7 rounded-xl bg-slate-100 flex items-center justify-center text-[#1c2d4f]"><Users size={13} /></div>
                                        <h3 className="text-xs font-black text-[#1c2d4f] tracking-wide">Dados do cliente</h3>
                                    </div>
                                    <p className="text-base font-bold text-slate-800 capitalize">{selectedItem.customerName?.toLowerCase()}</p>
                                    {selectedItem.customerAddress && (
                                        <div className="flex items-start gap-1.5 mt-2">
                                            <MapPin size={11} className="text-slate-400 mt-0.5 shrink-0" />
                                            <p className="text-[11px] text-slate-500 font-medium capitalize">{selectedItem.customerAddress?.toLowerCase()}</p>
                                        </div>
                                    )}
                                </div>

                                {/* Valor */}
                                <div className="bg-[#1c2d4f] rounded-2xl p-5 text-white relative overflow-hidden">
                                    <div className="absolute -top-6 -right-6 w-24 h-24 bg-white/5 rounded-full blur-2xl" />
                                    <p className="text-xs font-bold text-white/60 tracking-wider mb-1">Valor total</p>
                                    <p className="text-3xl font-black tracking-tight">{formatCurrency(selectedItem.value)}</p>
                                    <div className="flex items-center gap-2 mt-4">
                                        <div className="w-6 h-6 bg-[#1c2d4f]/60 border border-white/10 rounded-lg flex items-center justify-center"><Calendar size={12} className="text-white/60" /></div>
                                        <p className="text-[10px] font-bold text-white/70">{new Date(selectedItem.date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Técnico + Descrição */}
                            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                                <div className="flex items-center gap-2 pb-3 border-b border-slate-50 mb-4">
                                    <div className="w-7 h-7 rounded-xl bg-slate-100 flex items-center justify-center text-[#1c2d4f]"><Info size={13} /></div>
                                    <h3 className="text-xs font-black text-[#1c2d4f] tracking-wide">Descrição do atendimento</h3>
                                </div>
                                <div className="flex items-center gap-3 mb-4 p-3 bg-slate-50 rounded-xl">
                                    <div className="w-8 h-8 bg-slate-200 rounded-xl flex items-center justify-center">
                                        <UserCheck size={15} className="text-[#1c2d4f]" />
                                    </div>
                                    <div>
                                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Técnico designado</p>
                                        <p className="text-xs font-bold text-slate-700 capitalize">{selectedItem.technician?.toLowerCase()}</p>
                                    </div>
                                </div>
                                {selectedItem.description && <p className="text-xs text-slate-500 font-medium leading-relaxed italic">{selectedItem.description}</p>}
                            </div>

                            {/* Orçamentos vinculados (somente OS) */}
                            {selectedItem.type === 'ORDER' && (
                                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                                    <div className="flex items-center gap-2 pb-3 border-b border-slate-50 mb-4">
                                        <div className="w-7 h-7 rounded-xl bg-slate-100 flex items-center justify-center text-[#1c2d4f]"><Layer size={13} /></div>
                                        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-[#1c2d4f]">Orçamentos Vinculados</h3>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        {selectedItem.original.linkedQuotes?.map((qId: string) => {
                                            const q = quotes.find(quote => quote.id === qId);
                                            return q ? (
                                                <div key={qId} className="p-4 bg-slate-50 border border-slate-100 rounded-xl flex justify-between items-center">
                                                    <div>
                                                        <span className="text-[9px] font-black text-[#1c2d4f] uppercase">{q.displayId || 'ORC-' + qId.slice(0, 8).toUpperCase()}</span>
                                                        <p className="text-xs font-bold text-slate-700 mt-0.5 truncate max-w-[150px]">{q.title}</p>
                                                    </div>
                                                    <span className="text-sm font-black text-slate-900">{formatCurrency(q.totalValue)}</span>
                                                </div>
                                            ) : null;
                                        })}
                                        {(!selectedItem.original.linkedQuotes || selectedItem.original.linkedQuotes.length === 0) && (
                                            <div className="col-span-full py-6 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
                                                <p className="text-[10px] text-slate-300 font-bold uppercase">Nenhum orçamento vinculado</p>
                                            </div>
                                        )}
                                        {availableQuotesForClient.length > 0 && selectedItem.status !== 'PAID' && (
                                            <div className="col-span-full pt-3 border-t border-slate-100">
                                                <p className="text-[9px] font-black text-slate-400 uppercase mb-2">Disponíveis para vincular:</p>
                                                <div className="flex flex-wrap gap-2">
                                                    {availableQuotesForClient.map(q => (
                                                        <button key={q.id} onClick={() => handleLinkQuote(q.id)} disabled={isProcessing} className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl flex items-center gap-2 hover:border-[#1c2d4f] hover:bg-[#1c2d4f]/5 transition-all text-[10px] font-bold text-slate-700 uppercase">
                                                            {q.displayId || 'ORC-' + q.id.slice(0, 8).toUpperCase()} — {formatCurrency(q.totalValue)}
                                                            <Plus size={12} className="text-[#1c2d4f]" />
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Se já faturado: exibe detalhes */}
                            {selectedItem.status === 'PAID' && (
                                <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-5">
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="w-8 h-8 bg-emerald-500 rounded-xl flex items-center justify-center"><Check size={16} className="text-white" /></div>
                                        <p className="text-[11px] font-black text-emerald-800 uppercase tracking-widest">Baixa Realizada</p>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="bg-white rounded-xl p-3 border border-emerald-100">
                                            <p className="text-[9px] font-black text-emerald-500 uppercase mb-1">Método</p>
                                            <p className="text-xs font-black text-emerald-900 uppercase">{selectedItem.original.paymentMethod || '—'}</p>
                                        </div>
                                        <div className="bg-white rounded-xl p-3 border border-emerald-100">
                                            <p className="text-[9px] font-black text-emerald-500 uppercase mb-1">Data</p>
                                            <p className="text-xs font-black text-emerald-900">{selectedItem.original.paidAt ? new Date(selectedItem.original.paidAt).toLocaleDateString('pt-BR') : '—'}</p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Acesso Rápido */}
                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    onClick={() => {
                                        const route = selectedItem.type === 'QUOTE' ? 'view-quote' : 'view';
                                        const token = selectedItem.original.publicToken || selectedItem.id;
                                        window.open(`${window.location.origin}/#/${route}/${token}`, '_blank');
                                    }}
                                    className="py-3.5 bg-white border border-slate-200 rounded-xl flex items-center justify-between px-5 text-[#1c2d4f] hover:bg-[#1c2d4f] hover:text-white transition-all shadow-sm"
                                >
                                    <span className="text-[10px] font-black uppercase tracking-wide">Link Público</span>
                                    <ArrowUpRight size={16} />
                                </button>
                                <button
                                    onClick={() => handlePrint(selectedItem)}
                                    className="py-3.5 bg-white border border-slate-200 rounded-xl flex items-center justify-between px-5 text-slate-600 hover:bg-slate-900 hover:text-white transition-all shadow-sm"
                                >
                                    <span className="text-[10px] font-black uppercase tracking-wide">Imprimir</span>
                                    <Printer size={16} />
                                </button>
                            </div>
                        </div>

                        {/* Footer de Ação */}
                        <div className="p-4 bg-white/80 backdrop-blur-md flex gap-3 z-10 sticky bottom-0 border-t border-slate-100 shadow-[0_-5px_20px_rgba(0,0,0,0.02)] rounded-b-3xl">
                            <button onClick={() => setIsSidebarOpen(false)} className="px-6 py-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:text-slate-800 transition-all hover:bg-slate-50">
                                Fechar Painel
                            </button>
                            {selectedItem.status !== 'PAID' ? (
                                <button
                                    onClick={() => { setSelectedIds([selectedItem.id]); setIsInvoiceModalOpen(true); }}
                                    className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2"
                                >
                                    <DollarSign size={18} /> Confirmar Lançamento Financeiro
                                </button>
                            ) : (
                                <div className="flex-1 py-3 bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-xl font-bold text-sm text-center flex items-center justify-center gap-2">
                                    <CheckCircle2 size={18} /> Lançamento Liquidado
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ── MODAL DE FATURAMENTO ── */}
            {isInvoiceModalOpen && (
                <div className="fixed inset-0 z-[2000] bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
                    <div className="bg-white w-full max-w-4xl rounded-[2rem] shadow-2xl border border-slate-100 flex flex-col md:flex-row h-[95vh] md:h-auto md:max-h-[90vh] overflow-hidden">
                        
                        {/* ── ALINHAMENTO ESQUERDO: RESUMO DA FATURA ── */}
                        <div className="w-full md:w-5/12 bg-[#1c2d4f] p-6 md:p-10 flex flex-col justify-between text-white border-r border-[#ffffff]/10 shrink-0">
                            <div>
                                <div className="w-14 h-14 bg-white/10 backdrop-blur-sm rounded-2xl flex items-center justify-center mb-6">
                                    <Wallet size={26} className="text-white" />
                                </div>
                                <p className="text-[10px] font-black text-white/50 uppercase tracking-[0.2em] mb-2">Checkout Faturamento</p>
                                <h2 className="text-3xl font-black text-white tracking-tight leading-tight">Liquidação de<br />Recebíveis</h2>
                                <p className="text-sm text-white/60 mt-4 leading-relaxed font-medium">Confirme o recebimento deste faturamento para gerar o recibo oficial e atualizar o caixa.</p>

                                <div className="mt-8 space-y-4">
                                    <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-5 border border-white/10 transition-all hover:bg-white/10">
                                        <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-1.5 flex items-center gap-2">
                                            <Layers size={12}/> Documentos a faturar
                                        </p>
                                        <p className="text-base font-black text-white uppercase">{selectedIds.length === 1 ? (selectedItem ? getDocLabel(selectedItem) : '—') : `${selectedIds.length} Itens Lançados`}</p>
                                        <p className="text-xs text-white/50 font-medium mt-1 uppercase tracking-wide">{selectedIds.length === 1 ? selectedItem?.customerName : 'Múltiplos clientes'}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-10 pt-8 border-t border-white/10">
                                <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                                    <DollarSign size={12}/> Valor Total a Receber
                                </p>
                                <p className="text-5xl font-black text-white italic tracking-tighter">
                                    {formatCurrency(selectedIds.length === 1 ? (selectedItem?.value || 0) : selectedTotal)}
                                </p>
                            </div>
                        </div>

                        {/* ── ALINHAMENTO DIREITO: FORMULÁRIO ── */}
                        <div className="w-full md:w-7/12 bg-white flex flex-col flex-1 min-h-0">
                            
                            <div className="p-6 md:p-8 md:px-10 flex justify-between items-center shrink-0">
                                <h3 className="text-lg font-black text-slate-800 tracking-tight flex items-center gap-3">
                                    <CreditCard size={20} className="text-[#1c2d4f]"/> Detalhes do Pagamento
                                </h3>
                                <button onClick={() => setIsInvoiceModalOpen(false)} className="p-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-full text-slate-400 hover:text-slate-700 transition-all hover:rotate-90">
                                    <X size={18} />
                                </button>
                            </div>

                            <div className="px-6 md:px-10 pb-4 space-y-6 flex-1 overflow-y-auto min-h-0">
                                {/* Formas de Pagamento */}
                                <div>
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Meio de Pagamento</p>
                                    <div className="grid grid-cols-3 gap-3">
                                        {paymentMethods.map(method => (
                                            <button
                                                key={method.id}
                                                onClick={() => setPaymentMethod(method.id)}
                                                className={`flex flex-col items-center justify-center p-4 border rounded-2xl transition-all ${paymentMethod === method.id
                                                    ? 'border-[#1c2d4f] bg-[#1c2d4f]/5 text-[#1c2d4f] ring-2 ring-[#1c2d4f]/20 shadow-sm scale-[1.02]'
                                                    : 'border-slate-200 hover:border-slate-300 text-slate-400 hover:text-slate-800 bg-white hover:bg-slate-50'}`}
                                            >
                                                <div className="mb-2 opacity-80">{method.icon}</div>
                                                <span className="text-[10px] font-black uppercase tracking-wider leading-tight text-center">{method.label}</span>
                                            </button>
                                        ))}
                                    </div>

                                    {/* Parcelas */}
                                    {paymentMethod === 'Cartão Crédito' && (
                                        <div className="mt-6 p-6 bg-slate-50 border border-slate-200/60 rounded-3xl animate-fade-in">
                                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2"><Layers size={12}/> Numero de Parcelas</p>
                                            <div className="grid grid-cols-6 gap-2">
                                                {[2, 3, 4, 5, 6, 12].map(n => (
                                                    <button
                                                        key={n}
                                                        onClick={() => setInstallments(n)}
                                                        className={`py-2.5 rounded-xl text-[11px] font-black transition-all ${installments === n ? 'bg-[#1c2d4f] text-white shadow-md scale-105' : 'bg-white border border-slate-200 text-slate-500 hover:border-[#1c2d4f]/50 hover:text-slate-800'}`}
                                                    >
                                                        {n}x
                                                    </button>
                                                ))}
                                            </div>
                                            <div className="mt-5 pt-4 border-t border-slate-200 flex items-center justify-between">
                                                <span className="text-xs font-bold text-slate-400 uppercase">Valor da parcela</span>
                                                <span className="text-sm font-black text-[#1c2d4f] uppercase tracking-wide">
                                                    {installments}x de {formatCurrency((selectedIds.length === 1 ? (selectedItem?.value || 0) : selectedTotal) / installments)}
                                                </span>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Observações */}
                                <div>
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                                        <FileText size={12}/> Referência Legal / Comprovante
                                    </p>
                                    <textarea
                                        className="w-full min-h-[100px] bg-slate-50 border border-slate-200 rounded-3xl p-5 text-sm font-medium text-slate-700 outline-none focus:ring-4 focus:ring-[#1c2d4f]/10 focus:border-[#1c2d4f]/30 transition-all resize-none placeholder:font-medium placeholder:text-slate-400"
                                        placeholder="Ex: Nº do comprovante transacional, código de autenticação Pix, NSU da maquineta..."
                                        value={billingNotes}
                                        onChange={e => setBillingNotes(e.target.value)}
                                    />
                                </div>
                            </div>

                            {/* Botões Ação */}
                            <div className="p-6 md:p-8 md:px-10 border-t border-slate-100 bg-white shrink-0 shadow-[0_-5px_15px_rgba(0,0,0,0.02)] z-10">
                                <div className="flex gap-4">
                                    <button onClick={() => setIsInvoiceModalOpen(false)} className="px-8 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-black uppercase text-slate-500 hover:text-slate-800 hover:bg-white hover:border-slate-300 tracking-widest transition-all">
                                        Cancelar
                                    </button>
                                    <button
                                        onClick={confirmInvoice}
                                        disabled={isProcessing}
                                        className="flex-1 py-4 bg-emerald-600 hover:bg-emerald-500 hover:-translate-y-0.5 disabled:opacity-60 disabled:hover:translate-y-0 disabled:cursor-not-allowed text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl shadow-emerald-600/20 active:scale-[0.98] transition-all flex items-center justify-center gap-3"
                                    >
                                        {isProcessing ? (
                                            <><div className="w-5 h-5 border-[3px] border-white/30 border-t-white rounded-full animate-spin" /> Concluindo Baixa...</>
                                        ) : (
                                            <><ShieldCheck size={20} /> Liquidar Recebíveis</>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>

                    </div>
                </div>
            )}

            {/* ── MODAL DE IMPRESSÃO / RECIBO DE FATURAMENTO ── */}
            {isPrintModalOpen && printItem && (
                <div className="fixed inset-0 z-[3000] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in print:bg-white print:p-0 print:fixed print:inset-0">
                    <div className="bg-white w-full max-w-3xl max-h-[95vh] overflow-y-auto rounded-3xl shadow-2xl border border-slate-100 print:rounded-none print:max-w-none print:max-h-none print:overflow-visible print:shadow-none print:border-0">

                        {/* Barra de ação — oculta na impressão */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50 print:hidden">
                            <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Pré-visualização do Recibo</p>
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={executePrint}
                                    className="flex items-center gap-2 px-5 py-2.5 bg-[#1c2d4f] text-white rounded-xl text-xs font-black uppercase shadow-md hover:bg-[#253a66] transition-all"
                                >
                                    <Printer size={14} /> Imprimir
                                </button>
                                <button
                                    onClick={() => { setIsPrintModalOpen(false); setPrintItem(null); }}
                                    className="p-2.5 bg-white border border-slate-200 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-all"
                                >
                                    <X size={18} />
                                </button>
                            </div>
                        </div>

                        {/* ─── Conteúdo do Recibo (imprimível) ─── */}
                        <div id="printable-receipt" ref={printRef} className="p-10 space-y-8">

                            {/* Cabeçalho com branding da empresa */}
                            <div className="flex items-start justify-between pb-8 border-b-2 border-[#1c2d4f]">
                                <div className="flex items-center gap-4">
                                    {(tenant?.logo_url || tenant?.logoUrl) ? (
                                        <img
                                            src={tenant.logo_url || tenant.logoUrl}
                                            alt={tenant.company_name || tenant.name || 'Logo'}
                                            className="h-12 w-auto object-contain"
                                        />
                                    ) : (
                                        <div className="w-12 h-12 bg-[#1c2d4f] rounded-xl flex items-center justify-center">
                                            <Wallet size={20} className="text-white" />
                                        </div>
                                    )}
                                    <div>
                                        <h1 className="text-xl font-black text-[#1c2d4f] uppercase tracking-tight leading-none">
                                            {tenant?.company_name || tenant?.trading_name || tenant?.name || 'Empresa'}
                                        </h1>
                                        {tenant?.cnpj || tenant?.document ? (
                                            <p className="text-[10px] text-slate-500 font-bold mt-1 uppercase">
                                                CNPJ: {tenant.cnpj || tenant.document}
                                            </p>
                                        ) : null}
                                        {(tenant?.address || tenant?.street) ? (
                                            <p className="text-[10px] text-slate-400 font-medium leading-tight">
                                                {tenant.street
                                                    ? `${tenant.street}${tenant.number ? ', ' + tenant.number : ''}${tenant.neighborhood ? ' - ' + tenant.neighborhood : ''}${tenant.city ? ', ' + tenant.city : ''}${tenant.state ? '/' + tenant.state : ''}`
                                                    : tenant.address
                                                }
                                            </p>
                                        ) : null}
                                        {tenant?.phone && (
                                            <p className="text-[10px] text-slate-400 font-medium">{tenant.phone}</p>
                                        )}
                                        {tenant?.email && (
                                            <p className="text-[10px] text-slate-400 font-medium">{tenant.email}</p>
                                        )}
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Recibo de Faturamento</p>
                                    <p className="text-2xl font-black text-[#1c2d4f] italic tracking-tighter">
                                        #{getDocLabel(printItem)}
                                    </p>
                                    <p className="text-[11px] text-slate-400 font-bold mt-1">
                                        {new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
                                    </p>
                                </div>
                            </div>

                            {/* Dados do cliente */}
                            <div className="grid grid-cols-2 gap-8">
                                <div>
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1"><Users size={10} /> Dados do Cliente</p>
                                    <p className="text-base font-black text-slate-800 capitalize">{printItem.customerName?.toLowerCase()}</p>
                                    {printItem.customerAddress && (
                                        <p className="text-xs text-slate-500 font-medium mt-1">{printItem.customerAddress}</p>
                                    )}
                                </div>
                                <div className="text-right">
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Tipo de Documento</p>
                                    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[9px] font-black uppercase ${
                                        printItem.type === 'QUOTE' ? 'bg-[#1c2d4f]/10 text-[#1c2d4f]' : 'bg-slate-100 text-slate-700'
                                    }`}>
                                        {printItem.type === 'QUOTE' ? 'Orçamento' : 'Ordem de Serviço'}
                                    </span>
                                    {printItem.original?.paymentMethod && (
                                        <p className="text-xs text-slate-500 font-bold mt-2 uppercase">
                                            Pagamento: {printItem.original.paymentMethod}
                                        </p>
                                    )}
                                </div>
                            </div>

                            {/* Descrição do serviço */}
                            {printItem.title && (
                                <div className="bg-slate-50 rounded-2xl p-5">
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Descrição do Serviço</p>
                                    <p className="text-sm font-bold text-slate-800 uppercase">{printItem.title}</p>
                                    {printItem.description && (
                                        <p className="text-xs text-slate-500 mt-1 italic">{printItem.description}</p>
                                    )}
                                </div>
                            )}

                            {/* Orçamentos vinculados (se OS) */}
                            {printItem.type === 'ORDER' && printItem.original?.linkedQuotes?.length > 0 && (() => {
                                const linkedQts = (printItem.original.linkedQuotes as string[]).map((qId: string) => quotes.find(q => q.id === qId)).filter(Boolean);
                                if (!linkedQts.length) return null;
                                return (
                                    <div className="space-y-2">
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1"><Layer size={10} /> Orçamentos Vinculados</p>
                                        {linkedQts.map((q: any) => (
                                            <div key={q.id} className="flex justify-between items-center px-4 py-2.5 bg-slate-50 rounded-xl border border-slate-100">
                                                <div>
                                                    <span className="text-[9px] font-black text-[#1c2d4f] uppercase">{q.displayId || 'ORC-' + q.id.slice(0, 8).toUpperCase()}</span>
                                                    <p className="text-xs text-slate-600 font-bold">{q.title}</p>
                                                </div>
                                                <span className="text-sm font-black text-slate-800">{formatCurrency(q.totalValue)}</span>
                                            </div>
                                        ))}
                                    </div>
                                );
                            })()}

                            {/* Linha de Total */}
                            <div className="bg-[#1c2d4f] rounded-2xl px-8 py-6 flex items-center justify-between">
                                <div>
                                    <p className="text-[10px] font-black text-white/50 uppercase tracking-widest mb-1">Valor Total Faturado</p>
                                    {printItem.original?.paymentMethod && (
                                        <p className="text-xs text-white/70 font-bold">
                                            {printItem.original.paymentMethod}
                                            {printItem.original.paidAt && ` — ${new Date(printItem.original.paidAt).toLocaleDateString('pt-BR')}`}
                                        </p>
                                    )}
                                </div>
                                <p className="text-3xl font-black text-white tracking-tighter italic">
                                    {formatCurrency(printItem.value)}
                                </p>
                            </div>

                            {/* Status */}
                            <div className="flex items-center justify-between">
                                <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-black uppercase ${
                                    printItem.status === 'PAID' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
                                }`}>
                                    <span className={`w-2 h-2 rounded-full ${
                                        printItem.status === 'PAID' ? 'bg-emerald-500' : 'bg-amber-500'
                                    }`} />
                                    {printItem.status === 'PAID' ? 'Faturado / Liquidado' : 'Pendente'}
                                </div>
                                <p className="text-[9px] text-slate-300 font-bold uppercase tracking-widest">
                                    Gerado em {new Date().toLocaleString('pt-BR')}
                                </p>
                            </div>

                            {/* Rodapé */}
                            <div className="pt-6 border-t border-slate-100 text-center">
                                <p className="text-[9px] text-slate-300 font-bold uppercase tracking-widest">
                                    {tenant?.company_name || tenant?.name || 'Nexus Pro'} — Sistema de Gestão de Serviços
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                @keyframes slideInRight {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
                .animate-slide-in-right { animation: slideInRight 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
                @media print {
                    body * {
                        visibility: hidden;
                    }
                    #printable-receipt, #printable-receipt * {
                        visibility: visible;
                    }
                    #printable-receipt {
                        position: absolute;
                        left: 0;
                        top: 0;
                        width: 100%;
                        margin: 0;
                        padding: 0;
                    }
                    .print\\:hidden { visibility: hidden !important; display: none !important; }
                }
            `}</style>
        </div>
    );
};
