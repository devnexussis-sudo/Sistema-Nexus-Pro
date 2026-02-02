import React, { useState, useMemo } from 'react';
import { ServiceOrder, OrderStatus } from '../../types';
import { DollarSign, TrendingUp, CheckCircle2, ClipboardCheck, Calendar, Search, Filter, ArrowUpRight, ArrowDownRight, FileText } from 'lucide-react';

interface FinancialDashboardProps {
    orders: ServiceOrder[];
    quotes: any[];
}

export const FinancialDashboard: React.FC<FinancialDashboardProps> = ({ orders, quotes }) => {
    const [activeTab, setActiveTab] = useState<'all' | 'approved_quotes' | 'completed_orders'>('all');
    const [searchTerm, setSearchTerm] = useState('');

    // 1. Filtrar Orçamentos Aprovados
    const approvedQuotes = useMemo(() => {
        return quotes.filter(q =>
            q.status === 'APROVADO' || q.status === 'APPROVED'
        ).map(q => ({
            type: 'QUOTE' as const,
            id: q.id,
            customerName: q.customerName || q.customer_name,
            customerAddress: q.customerAddress || q.customer_address,
            title: q.title,
            description: q.description,
            date: q.created_at || q.createdAt,
            value: Number(q.totalValue || q.total_value) || 0,
            status: 'Aprovado',
            original: q
        }));
    }, [quotes]);

    // 2. Filtrar OS Concluídas com valor
    const completedOrdersWithRevenue = useMemo(() => {
        return orders.filter(o => o.status === OrderStatus.COMPLETED).map(order => {
            // Tenta encontrar um orçamento vinculado
            const linkedQuote = approvedQuotes.find(q => q.original.linkedOrderId === order.id || q.original.linked_order_id === order.id);

            // Se tiver orçamento vinculado, usamos o valor do orçamento
            // Se não, verificamos se existe algum campo de valor no formData (fallback)
            const value = linkedQuote?.value || (order.formData as any)?.price || (order.formData as any)?.value || 0;

            return {
                type: 'ORDER' as const,
                id: order.id,
                customerName: order.customerName,
                customerAddress: order.customerAddress,
                title: order.title,
                description: order.description,
                date: order.updatedAt,
                value: Number(value),
                status: 'Concluído',
                linkedQuote,
                original: order
            };
        }).filter(o => o.value > 0); // Só mostra OS que tem algum valor identificado
    }, [orders, approvedQuotes]);

    // 3. Lista Unificada
    const allTransactions = useMemo(() => {
        return [...approvedQuotes, ...completedOrdersWithRevenue].sort((a, b) =>
            new Date(b.date).getTime() - new Date(a.date).getTime()
        );
    }, [approvedQuotes, completedOrdersWithRevenue]);

    // Totais
    const totalApprovedQuotes = approvedQuotes.reduce((acc, q) => acc + q.value, 0);
    const totalRevenueRealized = completedOrdersWithRevenue.reduce((acc, o) => acc + o.value, 0);

    const formatCurrency = (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
    const formatDate = (date: string) => new Date(date).toLocaleDateString('pt-BR');

    // Filtragem baseada na aba e busca
    const displayedItems = useMemo(() => {
        let baseList = [];
        if (activeTab === 'all') baseList = allTransactions;
        else if (activeTab === 'approved_quotes') baseList = approvedQuotes;
        else baseList = completedOrdersWithRevenue;

        return baseList.filter(item =>
            item.customerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.id.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [activeTab, allTransactions, approvedQuotes, completedOrdersWithRevenue, searchTerm]);

    return (
        <div className="h-full overflow-y-auto bg-slate-50/50 p-8 custom-scrollbar">
            <div className="max-w-7xl mx-auto space-y-8 pb-20 animate-fade-in">

                {/* Header */}
                <div>
                    <h1 className="text-3xl font-black text-slate-900 uppercase italic tracking-tighter flex items-center gap-3">
                        <div className="p-3 bg-emerald-600 rounded-2xl shadow-xl shadow-emerald-600/20 text-white">
                            <DollarSign size={28} />
                        </div>
                        Gestão Financeira
                    </h1>
                    <p className="text-slate-500 font-medium mt-2 max-w-2xl">
                        Acompanhe o fluxo de receita gerado por orçamentos aprovados e ordens de serviço concluídas com valor.
                    </p>
                </div>

                {/* KPIs */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 relative overflow-hidden group hover:shadow-xl transition-all">
                        <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform">
                            <FileText size={80} className="text-blue-600" />
                        </div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Orçamentos Aprovados (Previsto)</p>
                        <h3 className="text-3xl font-black text-slate-900 italic tracking-tight">{formatCurrency(totalApprovedQuotes)}</h3>
                        <div className="mt-4 flex items-center gap-2 text-[10px] font-bold text-blue-600 bg-blue-50 w-fit px-3 py-1 rounded-full">
                            <TrendingUp size={12} /> {approvedQuotes.length} aprovados
                        </div>
                    </div>

                    <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 relative overflow-hidden group hover:shadow-xl transition-all">
                        <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform">
                            <CheckCircle2 size={80} className="text-emerald-600" />
                        </div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Receita Realizada (OS Concluída)</p>
                        <h3 className="text-3xl font-black text-slate-900 italic tracking-tight">{formatCurrency(totalRevenueRealized)}</h3>
                        <div className="mt-4 flex items-center gap-2 text-[10px] font-bold text-emerald-600 bg-emerald-50 w-fit px-3 py-1 rounded-full">
                            <ClipboardCheck size={12} /> {completedOrdersWithRevenue.length} concluídas
                        </div>
                    </div>

                    <div className="bg-slate-900 p-8 rounded-[2.5rem] shadow-xl shadow-slate-900/10 relative overflow-hidden text-white">
                        <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-indigo-500 rounded-full blur-[80px] opacity-30"></div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Conversão Financeira</p>
                        <h3 className="text-3xl font-black italic tracking-tight">
                            {totalApprovedQuotes > 0 ? Math.round((totalRevenueRealized / totalApprovedQuotes) * 100) : 0}%
                        </h3>
                        <p className="text-[10px] text-slate-400 mt-2">da receita prevista foi realizada.</p>
                    </div>
                </div>

                {/* Filters & Tabs */}
                <div className="flex flex-col md:flex-row justify-between items-center gap-6">
                    <div className="flex bg-white/60 p-1.5 rounded-2xl border border-slate-200 backdrop-blur-sm shadow-sm">
                        <button
                            onClick={() => setActiveTab('all')}
                            className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${activeTab === 'all' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'}`}
                        >
                            <Filter size={14} /> Visão Geral
                        </button>
                        <button
                            onClick={() => setActiveTab('approved_quotes')}
                            className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${activeTab === 'approved_quotes' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'}`}
                        >
                            <FileText size={14} /> Orçamentos
                        </button>
                        <button
                            onClick={() => setActiveTab('completed_orders')}
                            className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${activeTab === 'completed_orders' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'}`}
                        >
                            <CheckCircle2 size={14} /> OS Realizadas
                        </button>
                    </div>

                    <div className="relative w-full md:w-auto">
                        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Buscar por cliente, título ou ID..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-xs font-medium text-slate-700 w-full md:w-80 focus:outline-none focus:border-indigo-500/50 transition-all shadow-sm"
                        />
                    </div>
                </div>

                {/* Content */}
                <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden min-h-[400px]">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="border-b border-slate-100 bg-slate-50/50">
                                    <th className="p-6 text-[9px] font-black text-slate-400 uppercase tracking-widest w-20">Tipo</th>
                                    <th className="p-6 text-[9px] font-black text-slate-400 uppercase tracking-widest">Identificador</th>
                                    <th className="p-6 text-[9px] font-black text-slate-400 uppercase tracking-widest">Cliente</th>
                                    <th className="p-6 text-[9px] font-black text-slate-400 uppercase tracking-widest">Título / Descrição</th>
                                    <th className="p-6 text-[9px] font-black text-slate-400 uppercase tracking-widest">Data</th>
                                    <th className="p-6 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Valor</th>
                                    <th className="p-6 text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {displayedItems.length > 0 ? (
                                    displayedItems.map(item => (
                                        <tr key={`${item.type}-${item.id}`} className="hover:bg-slate-50/80 transition-colors group">
                                            <td className="p-6">
                                                {item.type === 'QUOTE' ?
                                                    <div className="p-2 bg-blue-100 text-blue-600 rounded-lg w-fit"><FileText size={16} /></div> :
                                                    <div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg w-fit"><CheckCircle2 size={16} /></div>
                                                }
                                            </td>
                                            <td className="p-6">
                                                <span className={`text-[10px] font-black px-2 py-1 rounded-lg ${item.type === 'QUOTE' ? 'text-blue-600 bg-blue-50' : 'text-emerald-600 bg-emerald-50'
                                                    }`}>
                                                    {item.type === 'QUOTE' ? '#' : 'OS#'}{item.id.slice(0, item.type === 'QUOTE' ? 8 : 6)}
                                                </span>
                                                {item.type === 'ORDER' && item.linkedQuote && (
                                                    <div className="mt-1 text-[8px] text-slate-400">Via Orç. #{item.linkedQuote.original.id.slice(0, 4)}</div>
                                                )}
                                            </td>
                                            <td className="p-6">
                                                <p className="text-xs font-bold text-slate-700">{item.customerName || 'Cliente não identificado'}</p>
                                                <p className="text-[9px] text-slate-400">{item.customerAddress}</p>
                                            </td>
                                            <td className="p-6">
                                                <p className="text-xs font-bold text-slate-700">{item.title}</p>
                                                <p className="text-[10px] text-slate-400 truncate max-w-xs">{item.description}</p>
                                            </td>
                                            <td className="p-6">
                                                <div className="flex items-center gap-2 text-slate-500">
                                                    <Calendar size={14} />
                                                    <span className="text-[11px] font-bold">{formatDate(item.date)}</span>
                                                </div>
                                            </td>
                                            <td className="p-6 text-right">
                                                <span className={`text-sm font-black ${item.type === 'QUOTE' ? 'text-slate-900' : 'text-emerald-600'}`}>
                                                    {formatCurrency(item.value)}
                                                </span>
                                            </td>
                                            <td className="p-6 text-center">
                                                <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-wide ${item.type === 'QUOTE' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'
                                                    }`}>
                                                    {item.type === 'QUOTE' ? <FileText size={12} /> : <CheckCircle2 size={12} />}
                                                    {item.status}
                                                </span>
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={7} className="p-12 text-center text-slate-400">
                                            <Filter size={32} className="mx-auto mb-3 opacity-20" />
                                            <p className="text-xs font-bold uppercase">Nenhum registro encontrado para o filtro selecionado.</p>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

            </div>
        </div>
    );
};
