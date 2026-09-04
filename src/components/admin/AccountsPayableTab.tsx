import React, { useState, useMemo } from 'react';
import { useAccountsPayable, NexusQueryClient } from '../../hooks/nexusHooks';
import { useI18n } from '../../i18n';
import { useDialog } from '../../contexts/DialogContext';
import { DataService } from '../../services/dataService';
import { Search, Plus, Filter, CreditCard, Calendar, ArrowUpRight, DollarSign, Loader2, CheckCircle2, Tag, RefreshCcw, Trash2, ArrowUp, ArrowDown, ArrowUpDown, ChevronDown } from 'lucide-react';
import { Pagination } from '../ui/Pagination';
import { CreatePayableModal } from './CreatePayableModal';
import { PayableCategoriesModal } from './PayableCategoriesModal';
import { FinancialService } from '../../services/financialService';

export const AccountsPayableTab: React.FC<{ tenantId: string }> = ({ tenantId }) => {
    const { t } = useI18n();
    const { showAlert, showConfirm } = useDialog();

    const getDefaultDates = () => {
        const dStart = new Date();
        dStart.setMonth(dStart.getMonth() - 1);
        
        const dEnd = new Date();
        dEnd.setMonth(dEnd.getMonth() + 6);
        
        return { start: dStart.toISOString().split('T')[0], end: dEnd.toISOString().split('T')[0] };
    };

    const [startDate, setStartDate] = useState(() => {
        const d = new Date();
        d.setDate(1); // Início do mês atual
        return d.toISOString().split('T')[0];
    });
    const [endDate, setEndDate] = useState(() => {
        const d = new Date();
        d.setMonth(d.getMonth() + 1);
        d.setDate(0); // Fim do mês atual
        return d.toISOString().split('T')[0];
    });
    const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL' | 'PENDING' | 'PAID'
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 10;
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({ key: 'createdAt', direction: 'desc' });

    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isCategoriesModalOpen, setIsCategoriesModalOpen] = useState(false);
    const [selectedItem, setSelectedItem] = useState<any | null>(null);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);

    const [showFilters, setShowFilters] = useState(false);

    const { data: payables = [], isLoading, isFetching, refetch } = useAccountsPayable(true, { start: startDate, end: endDate, status: statusFilter });

    // Resetar seleção ao mudar página ou filtro
    React.useEffect(() => {
        setSelectedIds([]);
    }, [currentPage, statusFilter, searchTerm, startDate, endDate]);

    const filteredItems = useMemo(() => {
        let items = payables;
        if (searchTerm) {
            const lowerSearch = searchTerm.toLowerCase();
            items = items.filter(item => 
                item.description.toLowerCase().includes(lowerSearch) ||
                (item.supplierName && item.supplierName.toLowerCase().includes(lowerSearch))
            );
        }
        if (sortConfig.key) {
            items = [...items].sort((a, b) => {
                let aValue: any = a[sortConfig.key as keyof typeof a];
                let bValue: any = b[sortConfig.key as keyof typeof b];

                if (sortConfig.key === 'createdAt') {
                    aValue = new Date(a.createdAt || 0).getTime();
                    bValue = new Date(b.createdAt || 0).getTime();
                } else if (sortConfig.key === 'dueDate') {
                    aValue = new Date(a.dueDate || 0).getTime();
                    bValue = new Date(b.dueDate || 0).getTime();
                } else if (sortConfig.key === 'amount') {
                    aValue = Number(a.amount || 0);
                    bValue = Number(b.amount || 0);
                } else {
                    aValue = String(aValue || '').toLowerCase();
                    bValue = String(bValue || '').toLowerCase();
                }

                if (aValue < bValue) {
                    return sortConfig.direction === 'asc' ? -1 : 1;
                }
                if (aValue > bValue) {
                    return sortConfig.direction === 'asc' ? 1 : -1;
                }
                return 0;
            });
        }
        return items;
    }, [payables, searchTerm, sortConfig]);

    const requestSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const getSortIcon = (columnKey: string) => {
        if (sortConfig.key !== columnKey) return <ArrowUpDown size={10} className="text-slate-300 ml-1.5 opacity-0 group-hover:opacity-100 transition-opacity inline" />;
        return sortConfig.direction === 'asc' 
            ? <ArrowUp size={10} className="text-[#1c2d4f] ml-1.5 inline" /> 
            : <ArrowDown size={10} className="text-[#1c2d4f] ml-1.5 inline" />;
    };

    const paginatedItems = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        return filteredItems.slice(start, start + ITEMS_PER_PAGE);
    }, [filteredItems, currentPage]);

    const totalPages = Math.ceil(filteredItems.length / ITEMS_PER_PAGE);

    const handleDateValidation = (start: string, end: string) => {
        if (start && end) {
            const d1 = new Date(start);
            const d2 = new Date(end);
            if ((d2.getTime() - d1.getTime()) > 31622400000) { // 366 dias
                showAlert('Atenção: O período selecionado não pode ser maior que 1 ano.', 'warning');
                setStartDate(start);
                setEndDate(new Date(d1.getTime() + 31536000000).toISOString().split('T')[0]);
                setCurrentPage(1);
                return;
            }
        }
        setStartDate(start);
        setEndDate(end);
        setCurrentPage(1);
    };

    const handleMarkAsPaid = async (item: any) => {
        showConfirm(
            `Confirmar o pagamento de ${item.description} no valor de R$ ${item.amount.toFixed(2)}? O valor será debitado do seu Fluxo de Caixa.`,
            async () => {
                try {
                    const paidAt = new Date().toISOString();
                    await FinancialService.updateAccountPayable(item.id, {
                        status: 'PAID',
                        paidAt,
                        paymentMethod: 'Dinheiro' // Default para simplificar, poderia abrir modal
                    });

                    // Lançar no fluxo de caixa (valor negativo por ser despesa, mas DataService espera valor absoluto e TYPE = EXPENSE)
                    await DataService.registerCashFlow({
                        type: 'EXPENSE',
                        category: item.category,
                        amount: item.amount,
                        description: `Pagamento de conta: ${item.description}${item.supplierName ? ` (${item.supplierName})` : ''}`,
                        referenceId: item.id,
                        referenceType: 'PAYABLE',
                        paymentMethod: 'Dinheiro',
                        entryDate: paidAt
                    });

                    showAlert('Conta paga e lançada no fluxo de caixa com sucesso!', 'success');
                    NexusQueryClient.invalidateFinancials();
                    refetch();
                } catch (error: any) {
                    showAlert(`Erro ao dar baixa: ${error.message}`, 'error');
                }
            },
            'Confirmar Pagamento',
            'Dar Baixa'
        );
    };

    const handleDelete = async (id: string) => {
        showConfirm(
            'Deseja inativar esta conta? Ela não será somada ao total do período.',
            async () => {
                try {
                    await FinancialService.updateAccountPayable(id, { status: 'CANCELLED' });
                    showAlert('Conta inativada com sucesso!', 'success');
                    NexusQueryClient.invalidateFinancials();
                    refetch();
                } catch (error: any) {
                    showAlert(`Erro ao inativar: ${error.message}`, 'error');
                }
            },
            'Inativar Conta',
            'Inativar',
            true
        );
    };

    // Calculadoras de totais
    const totalPending = useMemo(() => {
        return filteredItems
            .filter(i => i.status === 'PENDING')
            .reduce((acc, curr) => acc + curr.amount, 0);
    }, [filteredItems]);

    const totalSelected = useMemo(() => {
        return filteredItems
            .filter(i => selectedIds.includes(i.id))
            .reduce((acc, curr) => acc + curr.amount, 0);
    }, [filteredItems, selectedIds]);

    const toggleSelectAll = () => {
        if (selectedIds.length === paginatedItems.length && paginatedItems.length > 0) {
            setSelectedIds([]);
        } else {
            setSelectedIds(paginatedItems.map(i => i.id));
        }
    };

    const toggleSelect = (id: string, e: React.MouseEvent) => {
        e.stopPropagation(); // Prevenir abrir o modal
        setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    };

    return (
        <div className="space-y-4 pb-8">
            {/* Top Stats Banner */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex items-center justify-between">
                    <div>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Total a Pagar (Período)</p>
                        <h3 className="text-xl font-black text-slate-800">{totalPending.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</h3>
                    </div>
                    <div className="w-10 h-10 rounded-full bg-rose-50 flex items-center justify-center">
                        <DollarSign size={20} className="text-rose-500" />
                    </div>
                </div>

                <div className={`rounded-xl shadow-sm border p-4 flex items-center justify-between transition-colors ${
                    selectedIds.length > 0 ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-slate-200 opacity-50'
                }`}>
                    <div>
                        <p className={`text-[10px] font-bold uppercase tracking-widest ${selectedIds.length > 0 ? 'text-indigo-600' : 'text-slate-500'}`}>
                            {selectedIds.length} {selectedIds.length === 1 ? 'Selecionada' : 'Selecionadas'}
                        </p>
                        <h3 className={`text-xl font-black ${selectedIds.length > 0 ? 'text-indigo-900' : 'text-slate-400'}`}>
                            {totalSelected.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </h3>
                    </div>
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${selectedIds.length > 0 ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-50 text-slate-300'}`}>
                        <CheckCircle2 size={20} />
                    </div>
                </div>
            </div>

            {/* Top Toolbar */}
            <div className="bg-slate-50/80 p-3.5 rounded-xl border border-slate-200 shadow-sm space-y-3">
                <div className="flex flex-wrap lg:flex-nowrap items-center justify-between gap-3">
                    {/* Pesquisa */}
                    <div className="relative flex-1 min-w-[200px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                        <input
                            type="text"
                            placeholder="Pesquisar por descrição ou fornecedor..."
                            value={searchTerm}
                            onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                            className="w-full h-9 pl-9 pr-4 text-xs font-medium bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2d4f]/10 transition-shadow shadow-sm"
                        />
                    </div>

                    {/* Botões de Ação */}
                    <div className="flex items-center gap-2 shrink-0">
                        <button
                            onClick={() => setShowFilters(!showFilters)}
                            className={`h-9 px-3 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm ${
                                showFilters ? 'bg-primary-50 border-primary-200 text-primary-600 shadow-inner' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                            }`}
                        >
                            <Filter size={14} /> <span>{showFilters ? 'Ocultar Filtros' : 'Filtros'}</span>
                        </button>

                        <button
                            onClick={() => refetch()}
                            disabled={isLoading || isFetching}
                            className="h-9 px-3 bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 rounded-lg text-xs font-semibold shadow-sm transition-colors flex items-center gap-1.5 disabled:opacity-50"
                            title="Atualizar Dados"
                        >
                            <RefreshCcw size={14} className={isLoading || isFetching ? 'animate-spin text-primary-600' : ''} />
                        </button>

                        <button
                            onClick={() => setIsCategoriesModalOpen(true)}
                            className="h-9 px-3 bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 rounded-lg text-xs font-semibold shadow-sm transition-colors flex items-center gap-1.5 hidden sm:flex"
                            title="Gerenciar Categorias"
                        >
                            <Tag size={14} />
                            <span>Categorias</span>
                        </button>

                        <button
                            onClick={() => setIsCreateModalOpen(true)}
                            className="h-9 px-4 bg-[#1c2d4f] hover:bg-[#2a4170] text-white rounded-lg text-xs font-semibold uppercase tracking-wider shadow-sm transition-all flex items-center gap-1.5 shrink-0"
                        >
                            <Plus size={16} /> Nova Conta
                        </button>
                    </div>
                </div>

                {/* Retractable Filters Panel */}
                {showFilters && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-3 bg-white rounded-xl border border-slate-200/80 animate-in fade-in slide-in-from-top-2 duration-200">
                        {/* De (Início) */}
                        <div className="sm:col-span-1 lg:col-span-1 flex flex-col gap-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-0.5">De (Início)</label>
                            <div className="relative flex items-center bg-slate-50 border border-slate-200 rounded-lg shadow-sm h-9 px-2.5">
                                <Calendar size={14} className="text-slate-400 shrink-0 mr-2" />
                                <input
                                    type="date"
                                    value={startDate}
                                    onChange={(e) => handleDateValidation(e.target.value, endDate)}
                                    className="bg-transparent border-none text-xs font-semibold text-slate-800 outline-none cursor-pointer w-full"
                                />
                            </div>
                        </div>

                        {/* Até (Fim) */}
                        <div className="sm:col-span-1 lg:col-span-1 flex flex-col gap-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-0.5">Até (Fim)</label>
                            <div className="relative flex items-center bg-slate-50 border border-slate-200 rounded-lg shadow-sm h-9 px-2.5">
                                <Calendar size={14} className="text-slate-400 shrink-0 mr-2" />
                                <input
                                    type="date"
                                    value={endDate}
                                    onChange={(e) => handleDateValidation(startDate, e.target.value)}
                                    className="bg-transparent border-none text-xs font-semibold text-slate-800 outline-none cursor-pointer w-full"
                                />
                            </div>
                        </div>

                        {/* Status Filter */}
                        <div className="sm:col-span-2 lg:col-span-1 flex flex-col gap-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-0.5">Status da Conta</label>
                            <select
                                value={statusFilter}
                                onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
                                className="w-full bg-white border border-slate-200 text-xs font-semibold uppercase text-slate-700 outline-none cursor-pointer px-3 py-2 rounded-lg h-9 shadow-sm"
                            >
                                <option value="ALL">Todas</option>
                                <option value="PENDING">Pendentes</option>
                                <option value="OVERDUE">Atrasadas</option>
                                <option value="PAID">Pagas</option>
                                <option value="CANCELLED">Inativas</option>
                            </select>
                        </div>

                        {/* Limpar Filtros */}
                        <div className="sm:col-span-2 lg:col-span-1 flex flex-col justify-end gap-1">
                            <button
                                onClick={() => {
                                    const date = new Date();
                                    setStartDate(new Date(date.getFullYear(), date.getMonth(), 1).toISOString().split('T')[0]);
                                    setEndDate(new Date(date.getFullYear(), date.getMonth() + 1, 0).toISOString().split('T')[0]);
                                    setStatusFilter('ALL');
                                    setSearchTerm('');
                                    setCurrentPage(1);
                                }}
                                className="h-9 w-full flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all"
                                title="Limpar todos os filtros"
                            >
                                <X size={14} /> Limpar
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Tabela de Contas a Pagar (DESKTOP VIEW) */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden hidden md:block">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[800px]">
                        <thead>
                            <tr className="bg-slate-50/80 border-b border-slate-200">
                                <th className="py-3 px-4 w-12">
                                    <input 
                                        type="checkbox" 
                                        className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                        checked={paginatedItems.length > 0 && selectedIds.length === paginatedItems.length}
                                        onChange={toggleSelectAll}
                                    />
                                </th>
                                <th className="py-3 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest cursor-pointer group select-none hover:bg-slate-200/50 transition-colors" onClick={() => requestSort('status')}>
                                    <div className="flex items-center">Status {getSortIcon('status')}</div>
                                </th>
                                <th className="py-3 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest cursor-pointer group select-none hover:bg-slate-200/50 transition-colors" onClick={() => requestSort('description')}>
                                    <div className="flex items-center">Descrição {getSortIcon('description')}</div>
                                </th>
                                <th className="py-3 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest cursor-pointer group select-none hover:bg-slate-200/50 transition-colors" onClick={() => requestSort('supplierName')}>
                                    <div className="flex items-center">Fornecedor {getSortIcon('supplierName')}</div>
                                </th>
                                <th className="py-3 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest cursor-pointer group select-none hover:bg-slate-200/50 transition-colors" onClick={() => requestSort('category')}>
                                    <div className="flex items-center">Categoria {getSortIcon('category')}</div>
                                </th>
                                <th className="py-3 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest cursor-pointer group select-none hover:bg-slate-200/50 transition-colors" onClick={() => requestSort('createdAt')}>
                                    <div className="flex items-center">Criada em {getSortIcon('createdAt')}</div>
                                </th>
                                <th className="py-3 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest cursor-pointer group select-none hover:bg-slate-200/50 transition-colors" onClick={() => requestSort('dueDate')}>
                                    <div className="flex items-center">Vencimento {getSortIcon('dueDate')}</div>
                                </th>
                                <th className="py-3 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right cursor-pointer group select-none hover:bg-slate-200/50 transition-colors" onClick={() => requestSort('amount')}>
                                    <div className="flex items-center justify-end">Valor {getSortIcon('amount')}</div>
                                </th>
                                <th className="py-3 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {isLoading ? (
                                <tr>
                                    <td colSpan={8} className="py-12 text-center text-slate-400">
                                        <Loader2 className="animate-spin mx-auto mb-2 text-[#1c2d4f]" size={24} />
                                        <span className="text-[10px] uppercase tracking-widest">Carregando contas a pagar...</span>
                                    </td>
                                </tr>
                            ) : paginatedItems.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="py-12 text-center text-slate-400">
                                        <DollarSign className="mx-auto mb-2 opacity-20" size={32} />
                                        <span className="text-[10px] uppercase tracking-widest">Nenhuma conta encontrada.</span>
                                    </td>
                                </tr>
                            ) : (
                                paginatedItems.map((item) => (
                                    <tr 
                                        key={item.id} 
                                        className={`transition-colors group cursor-pointer ${item.status === 'CANCELLED' ? 'opacity-60 bg-slate-50/80 grayscale' : selectedIds.includes(item.id) ? 'bg-indigo-50/50' : 'hover:bg-slate-50'}`}
                                        onClick={() => { setSelectedItem(item); setIsCreateModalOpen(true); }}
                                    >
                                        <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                                            <input 
                                                type="checkbox" 
                                                className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                                checked={selectedIds.includes(item.id)}
                                                onChange={(e) => toggleSelect(item.id, e as any)}
                                            />
                                        </td>
                                        <td className="py-3 px-4">
                                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[9px] font-bold uppercase tracking-widest ${
                                                item.status === 'CANCELLED' ? 'bg-slate-200 text-slate-500 border border-slate-300' :
                                                item.status === 'PAID' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' :
                                                item.dueDate < new Date().toISOString().split('T')[0] ? 'bg-rose-50 text-rose-600 border border-rose-100' :
                                                'bg-amber-50 text-amber-600 border border-amber-100'
                                            }`}>
                                                {item.status === 'CANCELLED' ? <Trash2 size={10} /> : item.status === 'PAID' ? <CheckCircle2 size={10} /> : <Calendar size={10} />}
                                                {item.status === 'CANCELLED' ? 'INATIVA' : item.status === 'PAID' ? 'PAGO' : item.dueDate < new Date().toISOString().split('T')[0] ? 'ATRASADO' : 'PENDENTE'}
                                            </span>
                                        </td>
                                        <td className="py-3 px-4">
                                            <div className="font-semibold text-[13px] text-slate-700 flex items-center gap-1.5">
                                                {item.description}
                                                {item.isRecurring && (
                                                    <span className="bg-amber-100 text-amber-600 p-0.5 rounded" title={`Recorrente (${item.recurrencePeriod})`}>
                                                        <Loader2 size={10} className="animate-spin-slow" style={{ animationDuration: '3s' }} />
                                                    </span>
                                                )}
                                            </div>
                                            {item.notes && <div className="text-[10px] text-slate-400 truncate max-w-[200px]">{item.notes}</div>}
                                        </td>
                                        <td className="py-3 px-4 text-[11px] font-medium text-slate-600">{item.supplierName || '-'}</td>
                                        <td className="py-3 px-4">
                                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600">
                                                {item.category}
                                            </span>
                                        </td>
                                        <td className="py-3 px-4 text-[11px] font-medium text-slate-600">
                                            {new Date(item.createdAt).toLocaleDateString('pt-BR')}
                                        </td>
                                        <td className="py-3 px-4 text-[11px] font-medium text-slate-600">
                                            {new Date(item.dueDate + 'T12:00:00').toLocaleDateString('pt-BR')}
                                        </td>
                                        <td className="py-3 px-4 text-right">
                                            <span className="font-semibold text-[13px] text-slate-800">
                                                {item.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                            </span>
                                        </td>
                                        <td className="py-3 px-4 text-right" onClick={e => e.stopPropagation()}>
                                            <div className="flex justify-end gap-2">
                                                {item.status !== 'PAID' && item.status !== 'CANCELLED' && (
                                                    <button onClick={(e) => { e.stopPropagation(); handleMarkAsPaid(item); }} className="p-1.5 text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-md transition-colors" title="Dar Baixa">
                                                        <CheckCircle2 size={14} />
                                                    </button>
                                                )}
                                                {item.status !== 'CANCELLED' && item.status !== 'PAID' && (
                                                    <button onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }} className="p-1.5 text-rose-500 bg-rose-50 hover:bg-rose-100 rounded-md transition-colors" title="Inativar">
                                                        <Trash2 size={14} />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {!isLoading && totalPages > 1 && (
                    <div className="p-4 border-t border-slate-100 shrink-0 bg-slate-50/50">
                        <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
                    </div>
                )}
            </div>

            {/* 📱 CARDS VIEW (MOBILE & COMPACT SCREENS) */}
            <div className="md:hidden space-y-2.5">
                {isLoading ? (
                    <div className="p-12 text-center text-slate-400 bg-white rounded-xl border border-slate-200">
                        <Loader2 className="animate-spin mx-auto mb-2 text-[#1c2d4f]" size={24} />
                        <span className="text-xs uppercase font-medium tracking-widest">Carregando contas a pagar...</span>
                    </div>
                ) : paginatedItems.length === 0 ? (
                    <div className="p-12 text-center text-slate-400 bg-white rounded-xl border border-slate-200">
                        <DollarSign className="mx-auto mb-2 opacity-20" size={32} />
                        <span className="text-xs uppercase font-medium tracking-widest">Nenhuma conta encontrada.</span>
                    </div>
                ) : (
                    paginatedItems.map((item) => (
                        <div
                            key={item.id}
                            className={`bg-white p-3.5 rounded-xl shadow-sm border transition-all cursor-pointer relative ${
                                item.status === 'CANCELLED' 
                                    ? 'opacity-60 bg-slate-50/80 grayscale border-slate-200' 
                                    : selectedIds.includes(item.id) 
                                        ? 'border-indigo-400 ring-1 ring-indigo-100 bg-indigo-50/20' 
                                        : 'border-slate-200 hover:border-slate-300'
                            }`}
                            onClick={() => { setSelectedItem(item); setIsCreateModalOpen(true); }}
                        >
                            {/* Checkbox & Status Header */}
                            <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-slate-100">
                                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                    <input 
                                        type="checkbox" 
                                        className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                        checked={selectedIds.includes(item.id)}
                                        onChange={(e) => toggleSelect(item.id, e as any)}
                                    />
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                        Ref: #{item.id.slice(0, 6)}
                                    </span>
                                </div>
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                                    item.status === 'CANCELLED' ? 'bg-slate-200 text-slate-600' :
                                    item.status === 'PAID' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                                    item.dueDate < new Date().toISOString().split('T')[0] ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                                    'bg-amber-50 text-amber-700 border border-amber-200'
                                }`}>
                                    {item.status === 'CANCELLED' ? 'INATIVA' : item.status === 'PAID' ? 'PAGO' : item.dueDate < new Date().toISOString().split('T')[0] ? 'ATRASADO' : 'PENDENTE'}
                                </span>
                            </div>

                            {/* Description & Value */}
                            <div className="flex items-start justify-between gap-2 mb-2">
                                <div className="min-w-0 flex-1">
                                    <h4 className="font-bold text-sm text-slate-800 uppercase leading-snug truncate">{item.description}</h4>
                                    {item.supplierName && (
                                        <p className="text-xs text-slate-500 font-medium truncate mt-0.5">{item.supplierName}</p>
                                    )}
                                </div>
                                <div className="text-right shrink-0">
                                    <span className="text-base font-black text-slate-900 block leading-none">
                                        {item.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                    </span>
                                    <span className="inline-block mt-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 uppercase">
                                        {item.category}
                                    </span>
                                </div>
                            </div>

                            {/* Dates & Actions Footer */}
                            <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
                                <div className="flex items-center gap-3 text-[11px] text-slate-500">
                                    <span className="flex items-center gap-1">
                                        <Calendar size={12} className="text-slate-400" />
                                        <span className="font-semibold text-slate-700">{new Date(item.dueDate + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                                    </span>
                                </div>

                                <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                                    {item.status !== 'PAID' && item.status !== 'CANCELLED' && (
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); handleMarkAsPaid(item); }} 
                                            className="px-2.5 py-1 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors flex items-center gap-1"
                                            title="Dar Baixa"
                                        >
                                            <CheckCircle2 size={13} /> Pagar
                                        </button>
                                    )}
                                    {item.status !== 'CANCELLED' && item.status !== 'PAID' && (
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }} 
                                            className="p-1 text-rose-500 bg-rose-50 hover:bg-rose-100 rounded-lg transition-colors" 
                                            title="Inativar"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))
                )}

                {!isLoading && totalPages > 1 && (
                    <div className="p-4 bg-white rounded-xl border border-slate-200">
                        <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
                    </div>
                )}
            </div>

            {/* Modal de Criação */}
            {isCreateModalOpen && (
                <CreatePayableModal 
                    accountToEdit={selectedItem}
                    onClose={() => { setIsCreateModalOpen(false); setSelectedItem(null); }}
                    onSuccess={() => {
                        setIsCreateModalOpen(false);
                        setSelectedItem(null);
                        refetch();
                        NexusQueryClient.invalidateFinancials();
                    }}
                />
            )}

            {isCategoriesModalOpen && (
                <PayableCategoriesModal onClose={() => setIsCategoriesModalOpen(false)} />
            )}
        </div>
    );
};
