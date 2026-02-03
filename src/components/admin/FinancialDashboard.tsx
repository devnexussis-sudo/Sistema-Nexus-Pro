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
        <div className="p-4 animate-fade-in flex flex-col h-full bg-slate-50/20 overflow-hidden">
            {/* KPIs - Kept as they are essential for Financial view, but compact if needed */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4 flex-shrink-0">
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 relative overflow-hidden group hover:shadow-xl transition-all">
                    <div className="absolute top-0 right-0 p-5 opacity-10 group-hover:scale-110 transition-transform">
                        <FileText size={60} className="text-blue-600" />
                    </div>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Orçamentos (Previsto)</p>
                    <h3 className="text-2xl font-black text-slate-900 italic tracking-tight">{formatCurrency(totalApprovedQuotes)}</h3>
                    <div className="mt-2 flex items-center gap-1 text-[9px] font-bold text-blue-600 bg-blue-50 w-fit px-2 py-0.5 rounded-full">
                        <TrendingUp size={10} /> {approvedQuotes.length}
                    </div>
                </div>

                <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 relative overflow-hidden group hover:shadow-xl transition-all">
                    <div className="absolute top-0 right-0 p-5 opacity-10 group-hover:scale-110 transition-transform">
                        <CheckCircle2 size={60} className="text-emerald-600" />
                    </div>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Receita (Realizada)</p>
                    <h3 className="text-2xl font-black text-slate-900 italic tracking-tight">{formatCurrency(totalRevenueRealized)}</h3>
                    <div className="mt-2 flex items-center gap-1 text-[9px] font-bold text-emerald-600 bg-emerald-50 w-fit px-2 py-0.5 rounded-full">
                        <ClipboardCheck size={10} /> {completedOrdersWithRevenue.length}
                    </div>
                </div>

                <div className="bg-slate-900 p-5 rounded-2xl shadow-xl shadow-slate-900/10 relative overflow-hidden text-white">
                    <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-indigo-500 rounded-full blur-[60px] opacity-30"></div>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Conversão</p>
                    <h3 className="text-2xl font-black italic tracking-tight">
                        {totalApprovedQuotes > 0 ? Math.round((totalRevenueRealized / totalApprovedQuotes) * 100) : 0}%
                    </h3>
                    <p className="text-[9px] text-slate-400 mt-1">da receita prevista.</p>
                </div>
            </div>

            {/* Toolbar (Moved Outside) */}
            <div className="flex flex-col md:flex-row justify-between items-center gap-3 mb-2 flex-shrink-0">
                <div className="flex bg-white/60 p-1 rounded-xl border border-slate-200 backdrop-blur-sm shadow-sm">
                    <button
                        onClick={() => setActiveTab('all')}
                        className={`px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${activeTab === 'all' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'}`}
                    >
                        <Filter size={12} /> Visão Geral
                    </button>
                    <button
                        onClick={() => setActiveTab('approved_quotes')}
                        className={`px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${activeTab === 'approved_quotes' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'}`}
                    >
                        <FileText size={12} /> Orçamentos
                    </button>
                    <button
                        onClick={() => setActiveTab('completed_orders')}
                        className={`px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${activeTab === 'completed_orders' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'}`}
                    >
                        <CheckCircle2 size={12} /> OS Realizadas
                    </button>
                </div>

                <div className="relative w-full md:w-auto flex-1 md:flex-none">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Buscar por cliente, título ou ID..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-bold text-slate-700 w-full md:w-64 focus:outline-none focus:border-indigo-500/50 transition-all shadow-sm"
                    />
                </div>
            </div>

            {/* Content Table */}
            <div className="bg-white rounded-[2rem] border border-slate-100 shadow-2xl shadow-slate-200/40 flex flex-col overflow-hidden flex-1 min-h-0">
                <div className="flex-1 overflow-auto custom-scrollbar">
                    <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 bg-slate-50/95 backdrop-blur-sm z-10">
                            <tr className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">
                                <th className="p-4 border-b border-slate-100 w-16 text-center">Tipo</th>
                                <th className="p-4 border-b border-slate-100">Identificador</th>
                                <th className="p-4 border-b border-slate-100">Cliente</th>
                                <th className="p-4 border-b border-slate-100">Título / Descrição</th>
                                <th className="p-4 border-b border-slate-100">Data</th>
                                <th className="p-4 border-b border-slate-100 text-right">Valor</th>
                                <th className="p-4 border-b border-slate-100 text-center">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {displayedItems.length > 0 ? (
                                displayedItems.map(item => (
                                    <tr key={`${item.type}-${item.id}`} className="hover:bg-slate-50/80 transition-colors group">
                                        <td className="p-4 text-center">
                                            {item.type === 'QUOTE' ?
                                                <div className="p-1.5 bg-blue-100 text-blue-600 rounded-lg inline-flex"><FileText size={14} /></div> :
                                                <div className="p-1.5 bg-emerald-100 text-emerald-600 rounded-lg inline-flex"><CheckCircle2 size={14} /></div>
                                            }
                                        </td>
                                        <td className="p-4">
                                            <span className={`text-[10px] font-black px-2 py-1 rounded-lg ${item.type === 'QUOTE' ? 'text-blue-600 bg-blue-50' : 'text-emerald-600 bg-emerald-50'
                                                }`}>
                                                {item.type === 'QUOTE' ? '#' : 'OS#'}{item.id.slice(0, item.type === 'QUOTE' ? 8 : 6)}
                                            </span>
                                            {item.type === 'ORDER' && item.linkedQuote && (
                                                <div className="mt-1 text-[8px] text-slate-400">Via Orç. #{item.linkedQuote.original.id.slice(0, 4)}</div>
                                            )}
                                        </td>
                                        <td className="p-4">
                                            <p className="text-[10px] font-bold text-slate-700">{item.customerName || 'Cliente não identificado'}</p>
                                            <p className="text-[8px] text-slate-400 truncate max-w-[150px]">{item.customerAddress}</p>
                                        </td>
                                        <td className="p-4">
                                            <p className="text-[10px] font-bold text-slate-700">{item.title}</p>
                                            <p className="text-[8px] text-slate-400 truncate max-w-[200px]">{item.description}</p>
                                        </td>
                                        <td className="p-4">
                                            <div className="flex items-center gap-1.5 text-slate-500">
                                                <Calendar size={12} />
                                                <span className="text-[10px] font-bold">{formatDate(item.date)}</span>
                                            </div>
                                        </td>
                                        <td className="p-4 text-right">
                                            <span className={`text-xs font-black ${item.type === 'QUOTE' ? 'text-slate-900' : 'text-emerald-600'}`}>
                                                {formatCurrency(item.value)}
                                            </span>
                                        </td>
                                        <td className="p-4 text-center">
                                            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[8px] font-black uppercase tracking-wide ${item.type === 'QUOTE' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'
                                                }`}>
                                                {item.type === 'QUOTE' ? <FileText size={10} /> : <CheckCircle2 size={10} />}
                                                {item.status}
                                            </span>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={7} className="p-12 text-center text-slate-400">
                                        <Filter size={24} className="mx-auto mb-2 opacity-20" />
                                        <p className="text-[10px] font-bold uppercase">Nenhum registro encontrado.</p>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};
