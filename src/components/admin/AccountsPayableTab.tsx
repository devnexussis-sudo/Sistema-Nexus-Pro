import React, { useState, useMemo } from 'react';
import { useAccountsPayable, useTechnicians, NexusQueryClient } from '../../hooks/nexusHooks';
import { useI18n } from '../../i18n';
import { useDialog } from '../../contexts/DialogContext';
import { DataService } from '../../services/dataService';
import { Search, Plus, Filter, CreditCard, Calendar, ArrowUpRight, DollarSign, Loader2, CheckCircle2, Tag, RefreshCcw, Trash2, ArrowUp, ArrowDown, ArrowUpDown, ChevronDown, X, UserCheck, User, Award, CheckSquare } from 'lucide-react';
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
    const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL' | 'PENDING' | 'PAID' | 'OVERDUE' | 'CANCELLED'
    const [categoryFilter, setCategoryFilter] = useState('ALL'); // 'ALL' | 'Comissão' | etc.
    const [technicianFilter, setTechnicianFilter] = useState('ALL'); // 'ALL' | tech name
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 10;
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({ key: 'createdAt', direction: 'desc' });

    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isCategoriesModalOpen, setIsCategoriesModalOpen] = useState(false);
    const [selectedItem, setSelectedItem] = useState<any | null>(null);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);

    const [showFilters, setShowFilters] = useState(true);

    const { data: payables = [], isLoading, isFetching, refetch } = useAccountsPayable(true, { start: startDate, end: endDate, status: statusFilter });
    const { data: techniciansData = [] } = useTechnicians();

    // Resetar seleção ao mudar página ou filtro
    React.useEffect(() => {
        setSelectedIds([]);
    }, [currentPage, statusFilter, categoryFilter, technicianFilter, searchTerm, startDate, endDate]);

    // Extrair lista de técnicos únicos
    const availableTechnicians = useMemo(() => {
        const techSet = new Set<string>();
        if (techniciansData && Array.isArray(techniciansData)) {
            techniciansData.forEach((t: any) => { if (t.name) techSet.add(t.name); });
        }
        payables.forEach(item => {
            if (item.supplierName && (item.category === 'Comissão' || !item.category)) {
                techSet.add(item.supplierName);
            }
        });
        return Array.from(techSet).sort();
    }, [techniciansData, payables]);

    // Extrair lista de categorias únicas
    const availableCategories = useMemo(() => {
        const catSet = new Set<string>();
        catSet.add('Comissão');
        payables.forEach(item => { if (item.category) catSet.add(item.category); });
        return Array.from(catSet).sort();
    }, [payables]);

    const filteredItems = useMemo(() => {
        let items = payables;

        // Filtro por Categoria
        if (categoryFilter !== 'ALL') {
            items = items.filter(item => (item.category || '').toLowerCase() === categoryFilter.toLowerCase());
        }

        // Filtro por Técnico (Fornecedor)
        if (technicianFilter !== 'ALL') {
            items = items.filter(item => 
                (item.supplierName || '').toLowerCase().trim() === technicianFilter.toLowerCase().trim()
            );
        }

        // Filtro de Pesquisa por texto
        if (searchTerm) {
            const lowerSearch = searchTerm.toLowerCase();
            items = items.filter(item => 
                (item.description || '').toLowerCase().includes(lowerSearch) ||
                (item.supplierName && item.supplierName.toLowerCase().includes(lowerSearch)) ||
                (item.category && item.category.toLowerCase().includes(lowerSearch))
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
    }, [payables, categoryFilter, technicianFilter, searchTerm, sortConfig]);

    // Estatísticas de comissões/contas filtradas
    const commissionStats = useMemo(() => {
        const isCommissionFocus = categoryFilter === 'Comissão' || technicianFilter !== 'ALL';
        const targetItems = isCommissionFocus
            ? filteredItems.filter(i => (i.category || '').toLowerCase() === 'comissão' || technicianFilter !== 'ALL')
            : filteredItems;

        const totalCount = targetItems.length;
        const pendingItems = targetItems.filter(i => i.status === 'PENDING');
        const pendingCount = pendingItems.length;
        const pendingTotal = pendingItems.reduce((acc, curr) => acc + curr.amount, 0);

        const paidItems = targetItems.filter(i => i.status === 'PAID');
        const paidCount = paidItems.length;
        const paidTotal = paidItems.reduce((acc, curr) => acc + curr.amount, 0);

        const grandTotal = targetItems.reduce((acc, curr) => acc + curr.amount, 0);

        return {
            isCommissionFocus,
            totalCount,
            pendingCount,
            pendingTotal,
            paidCount,
            paidTotal,
            grandTotal,
            pendingItems
        };
    }, [filteredItems, categoryFilter, technicianFilter]);

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
                        paymentMethod: 'Pix'
                    });

                    await DataService.registerCashFlow({
                        type: 'EXPENSE',
                        category: item.category,
                        amount: item.amount,
                        description: `Pagamento de conta: ${item.description}${item.supplierName ? ` (${item.supplierName})` : ''}`,
                        referenceId: item.id,
                        referenceType: 'PAYABLE',
                        paymentMethod: 'Pix',
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

    const handleBulkMarkAsPaid = async (itemsToPay?: any[]) => {
        const list = itemsToPay || filteredItems.filter(i => selectedIds.includes(i.id) && i.status === 'PENDING');
        if (!list || list.length === 0) {
            showAlert('Nenhuma conta pendente para dar baixa.', 'warning');
            return;
        }
        const totalVal = list.reduce((acc, curr) => acc + curr.amount, 0);
        const techLabel = technicianFilter !== 'ALL' ? ` do técnico "${technicianFilter}"` : '';

        showConfirm(
            `Confirmar a baixa em lote de ${list.length} comissão(ões)/conta(s)${techLabel} no valor total de R$ ${totalVal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}?`,
            async () => {
                try {
                    const paidAt = new Date().toISOString();
                    for (const item of list) {
                        await FinancialService.updateAccountPayable(item.id, {
                            status: 'PAID',
                            paidAt,
                            paymentMethod: 'Pix'
                        });
                        await DataService.registerCashFlow({
                            type: 'EXPENSE',
                            category: item.category,
                            amount: item.amount,
                            description: `Pagamento de comissão/conta: ${item.description}${item.supplierName ? ` (${item.supplierName})` : ''}`,
                            referenceId: item.id,
                            referenceType: 'PAYABLE',
                            paymentMethod: 'Pix',
                            entryDate: paidAt
                        });
                    }
                    showAlert(`Baixa realizada em ${list.length} conta(s) com sucesso!`, 'success');
                    setSelectedIds([]);
                    NexusQueryClient.invalidateFinancials();
                    refetch();
                } catch (error: any) {
                    showAlert(`Erro ao dar baixa em lote: ${error.message}`, 'error');
                }
            },
            'Dar Baixa em Lote',
            'Confirmar Baixa'
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
        e.stopPropagation();
        setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    };

    return (
        <div className="space-y-4 pb-8">
            {/* Top Stats Banner */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {/* Card 1: Total a Pagar (Verde leve) */}
                <div className="bg-emerald-50/70 rounded-lg border border-emerald-200/80 px-3.5 py-2 shadow-2xs flex items-center justify-between">
                    <div>
                        <p className="text-[9px] font-bold text-emerald-700/90 uppercase tracking-wider">Total a Pagar ({technicianFilter !== 'ALL' ? technicianFilter : 'Período'})</p>
                        <h3 className="text-base font-extrabold text-emerald-950">{totalPending.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</h3>
                    </div>
                    <div className="w-7 h-7 rounded-md bg-emerald-100/90 flex items-center justify-center shrink-0">
                        <DollarSign size={15} className="text-emerald-700" />
                    </div>
                </div>

                {/* Card 2: Selecionadas (Azul leve) */}
                <div className={`rounded-lg shadow-2xs border px-3.5 py-2 flex items-center justify-between transition-colors ${
                    selectedIds.length > 0 
                        ? 'bg-sky-50/70 border-sky-200/90' 
                        : 'bg-slate-50/60 border-slate-200/70 opacity-70'
                }`}>
                    <div>
                        <p className={`text-[9px] font-bold uppercase tracking-wider ${selectedIds.length > 0 ? 'text-sky-700/90' : 'text-slate-500'}`}>
                            {selectedIds.length} {selectedIds.length === 1 ? 'Selecionada' : 'Selecionadas'}
                        </p>
                        <h3 className={`text-base font-extrabold ${selectedIds.length > 0 ? 'text-sky-950' : 'text-slate-400'}`}>
                            {totalSelected.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </h3>
                    </div>
                    <div className="flex items-center gap-2">
                        {selectedIds.length > 0 && (
                            <button
                                onClick={() => handleBulkMarkAsPaid()}
                                className="px-2.5 py-1 text-[10px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-md shadow-xs transition-colors flex items-center gap-1"
                                title="Dar baixa nas selecionadas"
                            >
                                <CheckCircle2 size={12} /> Dar Baixa ({selectedIds.length})
                            </button>
                        )}
                        <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${selectedIds.length > 0 ? 'bg-sky-100/90 text-sky-700' : 'bg-slate-100 text-slate-300'}`}>
                            <CheckCircle2 size={15} />
                        </div>
                    </div>
                </div>
            </div>

            {/* Painel Especial de Resumo de Comissões por Técnico */}
            {commissionStats.isCommissionFocus && (
                <div className="bg-gradient-to-r from-teal-900 via-slate-900 to-indigo-950 text-white rounded-xl p-4 shadow-md border border-teal-700/40 relative overflow-hidden animate-in fade-in duration-300">
                    <div className="absolute right-0 top-0 bottom-0 w-64 bg-teal-500/10 blur-2xl pointer-events-none" />
                    
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-3 pb-3 border-b border-white/10">
                        <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-teal-500/20 border border-teal-400/30 flex items-center justify-center text-teal-300 shadow-inner">
                                <UserCheck size={18} />
                            </div>
                            <div>
                                <span className="text-[10px] font-bold uppercase tracking-widest text-teal-300/90 block">
                                    Resumo Assertivo de Comissões
                                </span>
                                <h4 className="text-sm font-black text-white flex items-center gap-2">
                                    {technicianFilter !== 'ALL' ? technicianFilter : 'Todos os Técnicos'}
                                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-200 border border-teal-500/30">
                                        {new Date(startDate + 'T00:00:00').toLocaleDateString('pt-BR')} até {new Date(endDate + 'T00:00:00').toLocaleDateString('pt-BR')}
                                    </span>
                                </h4>
                            </div>
                        </div>

                        {commissionStats.pendingCount > 0 && (
                            <button
                                onClick={() => handleBulkMarkAsPaid(commissionStats.pendingItems)}
                                className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold rounded-lg shadow-md transition-all flex items-center gap-1.5 active:scale-95"
                            >
                                <CheckSquare size={14} />
                                <span>Pagar Todas as {commissionStats.pendingCount} Comissões ({commissionStats.pendingTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})</span>
                            </button>
                        )}
                    </div>

                    {/* KPIs em Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="bg-white/5 backdrop-blur-md rounded-lg p-2.5 border border-white/10">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-300 block">Qtd. Total Comissões</span>
                            <div className="flex items-baseline gap-1.5 mt-0.5">
                                <span className="text-lg font-black text-white">{commissionStats.totalCount}</span>
                                <span className="text-[10px] font-medium text-slate-400">no período</span>
                            </div>
                        </div>

                        <div className="bg-emerald-500/10 backdrop-blur-md rounded-lg p-2.5 border border-emerald-500/20">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-300 block">A Pagar (Pendentes)</span>
                            <div className="flex items-baseline justify-between mt-0.5">
                                <span className="text-lg font-black text-emerald-200">
                                    {commissionStats.pendingTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                </span>
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/30 text-emerald-200">
                                    {commissionStats.pendingCount} OSs
                                </span>
                            </div>
                        </div>

                        <div className="bg-sky-500/10 backdrop-blur-md rounded-lg p-2.5 border border-sky-500/20">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-sky-300 block">Já Pagas</span>
                            <div className="flex items-baseline justify-between mt-0.5">
                                <span className="text-lg font-black text-sky-200">
                                    {commissionStats.paidTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                </span>
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-sky-500/30 text-sky-200">
                                    {commissionStats.paidCount} OSs
                                </span>
                            </div>
                        </div>

                        <div className="bg-amber-500/10 backdrop-blur-md rounded-lg p-2.5 border border-amber-500/20">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-amber-300 block">Valor Total Gerado</span>
                            <div className="flex items-baseline justify-between mt-0.5">
                                <span className="text-lg font-black text-amber-200">
                                    {commissionStats.grandTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                </span>
                                <Award size={14} className="text-amber-400" />
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Top Toolbar */}
            <div className="bg-slate-50/80 p-3.5 rounded-xl border border-slate-200 shadow-sm space-y-3">
                <div className="flex flex-wrap lg:flex-nowrap items-center justify-between gap-3">
                    {/* Pesquisa */}
                    <div className="relative flex-1 min-w-[200px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                        <input
                            type="text"
                            placeholder="Pesquisar por descrição, fornecedor ou técnico..."
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
                                showFilters ? 'bg-teal-50 border-teal-200 text-teal-700 shadow-inner font-bold' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                            }`}
                        >
                            <Filter size={14} /> <span>{showFilters ? 'Filtros Ativos' : 'Filtros'}</span>
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

                {/* Retractable Filters Panel - Uma única linha perfeita em telas grandes */}
                {showFilters && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5 p-3 bg-white rounded-xl border border-slate-200/80 animate-in fade-in slide-in-from-top-2 duration-200 items-end">
                        {/* 1. Técnico */}
                        <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-extrabold text-teal-700 uppercase tracking-widest px-0.5 flex items-center gap-1 truncate">
                                <UserCheck size={11} className="text-teal-600 shrink-0" /> Técnico
                            </label>
                            <div className="relative">
                                <select
                                    value={technicianFilter}
                                    onChange={(e) => { setTechnicianFilter(e.target.value); setCurrentPage(1); }}
                                    className="w-full appearance-none bg-teal-50/70 border border-teal-200 text-xs font-bold text-teal-950 outline-none cursor-pointer pl-2.5 pr-7 py-2 rounded-lg h-9 shadow-2xs focus:ring-2 focus:ring-teal-500/20 truncate"
                                >
                                    <option value="ALL" className="bg-[#1c2d4f] text-white font-semibold py-1">👥 Todos os Técnicos</option>
                                    {availableTechnicians.map((tech) => (
                                        <option key={tech} value={tech} className="bg-[#1c2d4f] text-white font-medium py-1">
                                            👤 {tech}
                                        </option>
                                    ))}
                                </select>
                                <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-teal-600 pointer-events-none" />
                            </div>
                        </div>

                        {/* 2. Categoria */}
                        <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-0.5 truncate">Categoria</label>
                            <div className="relative">
                                <select
                                    value={categoryFilter}
                                    onChange={(e) => { setCategoryFilter(e.target.value); setCurrentPage(1); }}
                                    className="w-full appearance-none bg-white border border-slate-200 text-xs font-semibold text-slate-700 outline-none cursor-pointer pl-2.5 pr-7 py-2 rounded-lg h-9 shadow-sm focus:ring-2 focus:ring-[#1c2d4f]/10 truncate"
                                >
                                    <option value="ALL" className="bg-[#1c2d4f] text-white font-semibold py-1">Todas Categorias</option>
                                    <option value="Comissão" className="bg-[#1c2d4f] text-teal-300 font-bold py-1">💎 Comissão</option>
                                    {availableCategories.filter(c => c !== 'Comissão').map((cat) => (
                                        <option key={cat} value={cat} className="bg-[#1c2d4f] text-white font-medium py-1">{cat}</option>
                                    ))}
                                </select>
                                <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                            </div>
                        </div>

                        {/* 3. De (Início) */}
                        <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-0.5 truncate">De (Início)</label>
                            <div className="relative flex items-center bg-slate-50 border border-slate-200 rounded-lg shadow-sm h-9 px-2">
                                <Calendar size={13} className="text-slate-400 shrink-0 mr-1.5" />
                                <input
                                    type="date"
                                    value={startDate}
                                    onChange={(e) => handleDateValidation(e.target.value, endDate)}
                                    className="bg-transparent border-none text-[11px] font-semibold text-slate-800 outline-none cursor-pointer w-full"
                                />
                            </div>
                        </div>

                        {/* 4. Até (Fim) */}
                        <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-0.5 truncate">Até (Fim)</label>
                            <div className="relative flex items-center bg-slate-50 border border-slate-200 rounded-lg shadow-sm h-9 px-2">
                                <Calendar size={13} className="text-slate-400 shrink-0 mr-1.5" />
                                <input
                                    type="date"
                                    value={endDate}
                                    onChange={(e) => handleDateValidation(startDate, e.target.value)}
                                    className="bg-transparent border-none text-[11px] font-semibold text-slate-800 outline-none cursor-pointer w-full"
                                />
                            </div>
                        </div>

                        {/* 5. Status */}
                        <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-0.5 truncate">Status</label>
                            <div className="relative">
                                <select
                                    value={statusFilter}
                                    onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
                                    className="w-full appearance-none bg-white border border-slate-200 text-xs font-semibold uppercase text-slate-700 outline-none cursor-pointer pl-2.5 pr-7 py-2 rounded-lg h-9 shadow-sm focus:ring-2 focus:ring-[#1c2d4f]/10 truncate"
                                >
                                    <option value="ALL" className="bg-[#1c2d4f] text-white font-semibold py-1">Todas</option>
                                    <option value="PENDING" className="bg-[#1c2d4f] text-amber-300 font-semibold py-1">Pendentes</option>
                                    <option value="OVERDUE" className="bg-[#1c2d4f] text-rose-300 font-semibold py-1">Atrasadas</option>
                                    <option value="PAID" className="bg-[#1c2d4f] text-emerald-300 font-semibold py-1">Pagas</option>
                                    <option value="CANCELLED" className="bg-[#1c2d4f] text-slate-400 font-semibold py-1">Inativas</option>
                                </select>
                                <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                            </div>
                        </div>

                        {/* 6. Limpar Filtros (mesma linha) */}
                        <div className="flex flex-col gap-1">
                            <button
                                onClick={() => {
                                    const date = new Date();
                                    setStartDate(new Date(date.getFullYear(), date.getMonth(), 1).toISOString().split('T')[0]);
                                    setEndDate(new Date(date.getFullYear(), date.getMonth() + 1, 0).toISOString().split('T')[0]);
                                    setStatusFilter('ALL');
                                    setCategoryFilter('ALL');
                                    setTechnicianFilter('ALL');
                                    setSearchTerm('');
                                    setCurrentPage(1);
                                }}
                                className="h-9 w-full flex items-center justify-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border border-slate-200 shadow-2xs"
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
