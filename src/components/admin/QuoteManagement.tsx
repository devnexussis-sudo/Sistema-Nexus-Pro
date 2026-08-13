
import {
    Briefcase,
    Calculator,
    Calendar,
    Clock,
    Edit3,
    Eye,
    FileSpreadsheet,
    FileText,
    Filter,
    Hexagon,
    Link2,
    ListPlus,
    Loader2,
    Lock,
    MapPin,
    Plus,
    Printer,
    RefreshCw,
    Search,
    ShieldCheck,
    ShoppingCart,
    Signature as SignatureIcon,
    Trash2,
    User,
    X
} from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useDialog } from '../../contexts/DialogContext';
import { usePagedQuotes, useTenant } from '../../hooks/nexusHooks';
import { usePermissions } from '../../hooks/usePermissions';
import { useI18n } from '../../i18n';
import { Customer, OrderPriority, OrderStatus, Quote, QuoteItem, ServiceOrder, StockItem } from '../../types';
import { NexusBranding } from '../ui/NexusBranding';
import { Pagination } from '../ui/Pagination';

interface QuoteManagementProps {
    quotes: Quote[];
    customers: Customer[];
    orders: ServiceOrder[];
    onUpdateQuotes: () => Promise<void>;
    onCreateOrder: (order: any) => Promise<void>;
    onEditQuote: (quote: Quote) => Promise<void>;
    onCreateQuote: (quote: any) => Promise<void>;
    onDeleteQuote: (id: string) => Promise<void>;
    stockItems: StockItem[];
}

export const QuoteManagement: React.FC<QuoteManagementProps> = ({
    quotes, customers, orders, stockItems, onUpdateQuotes, onCreateOrder, onEditQuote, onCreateQuote, onDeleteQuote
}) => {
    const { t } = useI18n();
    const { showAlert, showConfirm } = useDialog();
    const { canCreate, canEdit, canDelete } = usePermissions();

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isViewModalOpen, setIsViewModalOpen] = useState(false);
    const [activeModalTab, setActiveModalTab] = useState<'gerais' | 'produtos'>('gerais');
    const [isConverting, setIsConverting] = useState(false);
    const [isPrinting, setIsPrinting] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [showFilters, setShowFilters] = useState(false);
    const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);
    const [viewQuote, setViewQuote] = useState<Quote | null>(null);
    const [isManualSyncing, setIsManualSyncing] = useState(false);
    const [selectedQuoteIds, setSelectedQuoteIds] = useState<string[]>([]);

    // ── Filter States ─────────────────────────────────────────────
    const [statusFilter, setStatusFilter] = useState('ALL');
    const getDefaultDates = () => {
        const dEnd = new Date();
        const dStart = new Date();
        dStart.setMonth(dStart.getMonth() - 6);
        return { start: dStart.toISOString().split('T')[0], end: dEnd.toISOString().split('T')[0] };
    };
    const { start: initStart, end: initEnd } = getDefaultDates();
    const [startDate, setStartDate] = useState(initStart);
    const [endDate, setEndDate] = useState(initEnd);

    const [currentPage, setCurrentPage] = useState(1);
    const PAGE_SIZE = 20;

    // ── Server-Side Pagination (Big Tech Standard) ──────────────
    const { auth } = useAuth();
    const serverFilters = useMemo(() => ({
        search: searchTerm.trim() || undefined,
        status: statusFilter !== 'ALL' ? statusFilter : undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
    }), [searchTerm, statusFilter, startDate, endDate]);

    const {
        data: pageResult,
        isLoading: quotesLoading,
        isFetching: quotesFetching,
        refetch: quotesRefetch,
    } = usePagedQuotes(currentPage, serverFilters, auth.isAuthenticated);

    const pagedQuotes = pageResult?.data ?? [];
    const totalQuotes = pageResult?.total ?? 0;
    const totalPages = pageResult?.lastPage ?? 1;

    const handleManualRefresh = async () => {
        setIsManualSyncing(true);
        try {
            await Promise.all([
                quotesRefetch(),
                onUpdateQuotes && onUpdateQuotes()
            ]);
            await new Promise(resolve => setTimeout(resolve, 600));
        } catch (error) {
            console.error('Erro ao sincronizar:', error);
        } finally {
            setIsManualSyncing(false);
        }
    };

    // Form States
    const [customerName, setCustomerName] = useState('');
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [items, setItems] = useState<QuoteItem[]>([]);
    const [notes, setNotes] = useState('');
    const [validUntil, setValidUntil] = useState('');
    const [linkedOrderId, setLinkedOrderId] = useState('');
    const [discount, setDiscount] = useState(0); // valor de desconto
    const [discountType, setDiscountType] = useState<'fixed' | 'percent'>('fixed'); // tipo de desconto

    const [clientSearch, setClientSearch] = useState('');
    const [isClientListOpen, setIsClientListOpen] = useState(false);
    const [isStockListOpen, setIsStockListOpen] = useState<{ [key: number]: boolean }>({});

    const filteredClients = useMemo(() => {
        const term = clientSearch.toLowerCase();
        return customers.filter(c =>
            c.name.toLowerCase().includes(term) ||
            (c.document && c.document.toLowerCase().includes(term)) ||
            (c.cpf && c.cpf.toLowerCase().includes(term)) ||
            (c.cnpj && c.cnpj.toLowerCase().includes(term))
        );
    }, [clientSearch, customers]);

    const subtotal = useMemo(() => items.reduce((acc, curr) => acc + curr.total, 0), [items]);
    const discountAmount = useMemo(() =>
        discountType === 'percent' ? (subtotal * discount / 100) : discount
        , [subtotal, discount, discountType]);
    const totalValue = useMemo(() => Math.max(0, subtotal - discountAmount), [subtotal, discountAmount]);

    const { data: tenant } = useTenant(auth.isAuthenticated);

    const getQuoteDisplayId = (quote: Quote): string => {
        if (quote.displayId) return quote.displayId;
        return `#${quote.id.slice(0, 8).toUpperCase()}`;
    };

    // ── Print handler (isolated window with inline A4 constraints) ──
    const handlePrintQuote = () => {
        if (!viewQuote) return;

        const container = document.getElementById('quote-print-container');
        if (!container) return;

        const printWindow = window.open('', '_blank', 'width=900,height=700');
        if (!printWindow) {
            showAlert('Por favor, permita pop-ups neste site para imprimir.', 'warning');
            return;
        }

        const styleLinks = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
            .map(el => el.outerHTML)
            .join('\n');

        printWindow.document.write(`<!DOCTYPE html>
        <html>
            <head>
                <title>Proposta Comercial - ${viewQuote.displayId || viewQuote.id}</title>
                ${styleLinks}
                <style>
                    @page { size: A4; margin: 10mm; }
                    *, *::before, *::after { box-sizing: border-box !important; }
                    html, body {
                        margin: 0 !important;
                        padding: 0 !important;
                        width: 100% !important;
                        overflow: hidden !important;
                        background: white !important;
                    }
                    .print-root {
                        width: 100% !important;
                        max-width: 100% !important;
                        overflow: hidden !important;
                        padding: 0 !important;
                        margin: 0 auto !important;
                    }
                    table {
                        width: 100% !important;
                        max-width: 100% !important;
                        table-layout: fixed !important;
                        border-collapse: collapse !important;
                        overflow: hidden !important;
                    }
                    td, th {
                        overflow: hidden !important;
                        text-overflow: ellipsis !important;
                        word-wrap: break-word !important;
                        overflow-wrap: break-word !important;
                    }
                    img { max-width: 100% !important; }
                    @media print {
                        html, body {
                            width: 100% !important;
                            overflow: visible !important;
                        }
                        .print-root {
                            width: 100% !important;
                            max-width: 100% !important;
                        }
                    }
                </style>
            </head>
            <body>
                <div class="print-root">
                    ${container.innerHTML}
                </div>
                <script>
                    window.onload = () => {
                        setTimeout(() => {
                            window.print();
                            window.close();
                        }, 500);
                    };
                </script>
            </body>
        </html>`);
        printWindow.document.close();
    };

    const previewId = useMemo(() => {
        if (selectedQuote) return selectedQuote.displayId || getQuoteDisplayId(selectedQuote);
        if (!customerName) return 'ORC-XXXXXX000';

        const customer = customers.find(c => c.name === customerName);
        const docClean = (customer?.document || '0000').replace(/\D/g, '');
        const docPart = docClean.substring(0, 2).padStart(2, '0');

        const now = new Date();
        const yy = String(now.getFullYear()).substring(2);
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const sequencer = String((totalQuotes % 999) + 1).padStart(3, '0');

        return `ORC-${docPart}${yy}${mm}${sequencer}`;
    }, [customerName, customers, selectedQuote, totalQuotes]);

    const customerOrders = useMemo(() => {
        if (!customerName) return [];
        const normalizedName = customerName.trim().toLowerCase();
        return orders.filter(o => o.customerName?.trim().toLowerCase() === normalizedName);
    }, [orders, customerName]);

    const handleAddItem = () => {
        const newItem: QuoteItem = {
            id: Math.random().toString(36).substr(2, 9),
            description: '',
            quantity: 1,
            unitPrice: 0,
            total: 0
        };
        setItems([...items, newItem]);
    };

    const updateItem = (index: number, fields: Partial<QuoteItem>) => {
        const newItems = [...items];
        newItems[index] = { ...newItems[index], ...fields };
        newItems[index].total = (newItems[index].quantity || 0) * (newItems[index].unitPrice || 0);
        setItems(newItems);
    };

    const [loading, setLoading] = useState(false);

    const handleSaveQuote = async () => {
        if (loading) return;
        try {
            setLoading(true);
            const customer = customers.find(c => c.name === customerName);
            const payload = {
                customerId: customer?.id || undefined,
                createdBy: auth.user?.id || undefined,
                customerName,
                customerAddress: customer?.address || '',
                customerDocument: customer?.document || '00000000000000',
                title,
                description,
                items,
                totalValue,
                discount,
                discountType,
                notes,
                validUntil,
                linkedOrderId,
                status: selectedQuote?.status || 'ABERTO'
            };

            if (selectedQuote) {
                await onEditQuote({ ...selectedQuote, ...payload });
            } else {
                await onCreateQuote(payload);
            }

            setIsModalOpen(false);
            resetForm();
        } catch (error: any) {
            console.error('[QuoteManagement] Erro ao salvar orçamento:', error);
            showAlert(`Falha ao salvar orçamento: ${error.message || 'Erro desconhecido'}`, 'error');
        } finally {
            setLoading(false);
        }
    };

    const resetForm = () => {
        setSelectedQuote(null);
        setCustomerName('');
        setTitle('');
        setDescription('');
        setItems([]);
        setNotes('');
        setValidUntil('');
        setLinkedOrderId('');
        setDiscount(0);
        setDiscountType('fixed');
        setLoading(false);
        setActiveModalTab('gerais');
    };

    const handleConvertToOrder = async (quote: Quote) => {
        showConfirm('Deseja converter este orçamento em uma Ordem de Serviço ativa?', async () => {
            try {
                setIsConverting(true);
                const orderPayload = {
                    title: `[ORÇAMENTO] ${quote.title}`,
                    description: quote.description,
                    customerName: quote.customerName,
                    customerAddress: quote.customerAddress,
                    status: OrderStatus.PENDING,
                    priority: OrderPriority.MEDIUM,
                    scheduledDate: new Date().toISOString().split('T')[0],
                    operationType: 'Serviço sob Orçamento',
                    quote_id: quote.id,
                    formData: {
                        items: quote.items,
                        totalValue: quote.totalValue,
                        isFromQuote: true
                    }
                };

                await onCreateOrder(orderPayload);
                await onEditQuote({ ...quote, status: 'CONVERTIDO' });
                showAlert('Conversão realizada com sucesso!', 'success');
            } catch (e) {
                console.error(e);
                showAlert('Falha na conversão.', 'error');
            } finally {
                setIsConverting(false);
            }
        }, 'Converter Orçamento', 'Converter', false);
    };

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm]);

    const toggleSelectAll = () => {
        const pageIds = pagedQuotes.map((q: any) => q.id);
        const allSelected = pageIds.length > 0 && pageIds.every((id: string) => selectedQuoteIds.includes(id));
        if (allSelected) {
            setSelectedQuoteIds((prev: string[]) => prev.filter(id => !pageIds.includes(id)));
        } else {
            setSelectedQuoteIds((prev: string[]) => Array.from(new Set([...prev, ...pageIds])));
        }
    };

    const handleExportExcel = async () => {
        if (selectedQuoteIds.length === 0) return;

        let itemsToExport: Quote[] = [];
        if (selectedQuoteIds.length > 0) {
            const localQuotes = pagedQuotes.filter((q: Quote) => selectedQuoteIds.includes(q.id));
            if (localQuotes.length === selectedQuoteIds.length) {
                itemsToExport = localQuotes;
            } else {
                try {
                    const { supabase } = await import('../../lib/supabase');
                    const { data } = await supabase.from('quotes').select('*').in('id', selectedQuoteIds);
                    if (data) {
                        itemsToExport = data.map((q: any) => ({
                            id: q.id,
                            displayId: q.display_id,
                            customerName: q.customer_name,
                            customerAddress: q.customer_address,
                            customerDocument: q.customer_document,
                            title: q.title,
                            description: q.description,
                            items: q.items,
                            totalValue: q.total_value,
                            notes: q.notes,
                            validUntil: q.valid_until,
                            status: q.status,
                            publicToken: q.public_token,
                            billingStatus: q.billing_status,
                            paymentMethod: q.payment_method,
                            paidAt: q.paid_at,
                            createdAt: q.created_at,
                            updatedAt: q.updated_at,
                            linkedOrderId: q.linked_order_id,
                            tenantId: q.tenant_id
                        }));
                    } else {
                        itemsToExport = localQuotes;
                    }
                } catch {
                    itemsToExport = localQuotes;
                }
            }
        }

        if (itemsToExport.length === 0) return;

        const XLSX = (await import('xlsx-js-style')).default;

        const formatDateTime = (dateStr?: string) => {
            if (!dateStr || dateStr === 'N/A') return 'N/A';
            const d = new Date(dateStr);
            if (isNaN(d.getTime())) return dateStr;
            return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        };
        const formatDate = (dateStr?: string) => {
            if (!dateStr || dateStr === 'N/A') return 'N/A';
            const d = new Date(dateStr + (dateStr.length === 10 ? 'T12:00:00' : ''));
            if (isNaN(d.getTime())) return dateStr;
            return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
        };

        const headers = [
            'ID / Protocolo',
            'Tipo do Documento',
            'Data de Criação',
            'Cliente',
            'Título',
            'Descrição',
            'Validade',
            'Vínculo O.S.',
            'Valor Total',
            'Status',
            'Status Financeiro',
        ];

        const headerStyle = {
            font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 },
            fill: { fgColor: { rgb: '1C2D4F' } },
            alignment: { horizontal: 'center', vertical: 'center' },
            border: {
                top: { style: 'thin', color: { rgb: 'FFFFFF' } },
                bottom: { style: 'thin', color: { rgb: 'FFFFFF' } },
                left: { style: 'thin', color: { rgb: 'FFFFFF' } },
                right: { style: 'thin', color: { rgb: 'FFFFFF' } }
            }
        };

        const rows = itemsToExport.map((item: Quote) => {
            return [
                getQuoteDisplayId(item),
                'Orçamento',
                formatDateTime(item.createdAt),
                item.customerName || 'N/A',
                item.title || 'N/A',
                item.description || 'N/A',
                formatDate(item.validUntil),
                item.linkedOrderId || 'Sem Vínculo',
                item.totalValue || 0,
                item.status || 'N/A',
                item.billingStatus === 'PAID' ? 'Faturado' : 'Pendente'
            ];
        });

        const wsData = [headers, ...rows];
        const ws = XLSX.utils.aoa_to_sheet(wsData);

        ws['!cols'] = [
            { wch: 15 }, { wch: 18 }, { wch: 20 }, { wch: 30 }, { wch: 30 }, { wch: 40 }, { wch: 15 }, { wch: 20 }, { wch: 15 }, { wch: 18 }, { wch: 18 },
        ];

        const range = XLSX.utils.decode_range(ws['!ref'] || "A1:A1");
        for (let C = range.s.c; C <= range.e.c; ++C) {
            const address = XLSX.utils.encode_cell({ r: 0, c: C });
            if (!ws[address]) continue;
            ws[address].s = headerStyle;
        }

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Orçamentos");
        XLSX.writeFile(wb, `Nexus_Orcamentos_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    return (
        <div className="p-4 flex flex-col h-full bg-slate-50/20 overflow-hidden font-poppins">
            <div className="mb-2 sm:mb-4 p-2 sm:p-3 rounded-2xl border border-[#1c2d4f]/20 bg-white/40 shadow-sm backdrop-blur-md flex flex-col gap-3">
                {/* Top Row */}
                <div className="flex flex-wrap lg:flex-nowrap items-center justify-between gap-2 sm:gap-3">
                    <div className="relative flex-1 min-w-[200px] w-full lg:w-auto">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input
                            type="text"
                            placeholder="Buscar por código ou cliente..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full h-10 bg-white border border-[#1c2d4f]/20 rounded-xl pl-9 pr-4 text-xs text-slate-700 placeholder-slate-400 outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all shadow-sm"
                        />
                    </div>

                    <div className="flex items-center gap-2 w-full lg:w-auto justify-end shrink-0">
                        {selectedQuoteIds.length > 0 && (
                            <div className="hidden sm:flex items-center gap-2 px-3 h-10 bg-slate-900 rounded-xl shadow-lg border border-slate-700">
                                <div className="flex flex-col pr-2 border-r border-slate-700">
                                    <span className="text-[8px] font-medium text-slate-400 uppercase leading-none mb-0.5">Sel.</span>
                                    <span className="text-[11px] font-medium text-white leading-none">{selectedQuoteIds.length}</span>
                                </div>
                                <button onClick={handleExportExcel} className="flex items-center gap-1.5 px-2 py-1 bg-emerald-500 hover:bg-emerald-400 text-white rounded-lg text-[9px] uppercase transition-all shadow-sm">
                                    <FileSpreadsheet size={12} /> Excel
                                </button>
                                <button onClick={() => setSelectedQuoteIds([])} className="p-1 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all">
                                    <X size={14} />
                                </button>
                            </div>
                        )}

                        <button
                            onClick={() => setShowFilters(!showFilters)}
                            className={`flex items-center gap-1.5 px-3 h-10 rounded-xl border transition-all text-[10px] ${showFilters ? 'bg-primary-50 border-primary-200 text-primary-600 shadow-inner' : 'bg-white border-[#1c2d4f]/20 text-[#1c2d4f] hover:bg-[#1c2d4f]/5 shadow-sm'}`}
                        >
                            <Filter size={14} /> <span className="hidden sm:inline">{showFilters ? 'Ocultar' : 'Filtros'}</span>
                        </button>

                        <button
                            onClick={handleManualRefresh}
                            disabled={quotesLoading || isManualSyncing}
                            className={`group h-10 px-4 flex items-center gap-2 rounded-xl border transition-all duration-300 shadow-sm active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed ${quotesLoading || isManualSyncing
                                ? 'bg-primary-50 border-primary-200 text-primary-600'
                                : 'bg-white hover:bg-slate-50 border-[#1c2d4f]/20 text-[#1c2d4f] hover:text-primary-600 hover:border-primary-300 hover:shadow-md'
                                }`}
                            title="Atualizar todos os dados"
                        >
                            <div className="relative flex items-center justify-center">
                                <RefreshCw
                                    size={16}
                                    className={`${quotesLoading || isManualSyncing ? "animate-spin" : "group-hover:rotate-180 transition-transform duration-500"}`}
                                />
                                {(quotesLoading || isManualSyncing) && (
                                    <span className="absolute inset-0 rounded-full bg-primary-400/20 animate-ping"></span>
                                )}
                            </div>
                        </button>
                        <button
                            onClick={(e) => {
                                if (!canCreate('quotes')) { e.preventDefault(); showAlert('Acesso Negado: Você não tem permissão para esta ação.'); return; }
                                resetForm(); setIsModalOpen(true);
                            }}
                            className={`hidden md:flex h-10 px-4 bg-[#10b981] hover:bg-[#059669] border-[#10b981] text-white text-[11px] shadow-lg shadow-[#10b981]/20 items-center gap-1.5 whitespace-nowrap transition-all rounded-xl ${!canCreate('quotes') ? 'opacity-50 !cursor-not-allowed' : ''}`}
                        >
                            <Plus size={14} /> Novo Orçamento
                        </button>
                    </div>
                </div>

                {/* Collapsible Filters */}
                {showFilters && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 p-3 bg-white/60 rounded-xl border border-[#1c2d4f]/10 animate-in fade-in slide-in-from-top-2 duration-200">
                        {/* Date Range */}
                        <div className="flex flex-col gap-1 lg:col-span-2">
                            <label className="text-[9px] text-slate-400 uppercase tracking-wider px-1">Período (criação)</label>
                            <div className="flex items-center gap-1 bg-white border border-[#1c2d4f]/20 p-1 rounded-lg shadow-sm h-9">
                                <Calendar size={13} className="text-slate-400 ml-1 shrink-0" />
                                <div className="flex items-center gap-1 px-1 flex-1 justify-between">
                                    <input
                                        type="date"
                                        value={startDate}
                                        onChange={e => { setStartDate(e.target.value); setCurrentPage(1); }}
                                        className="bg-transparent border-none text-[10px] text-slate-600 outline-none focus:text-slate-900 w-full"
                                    />
                                    <span className="text-[9px] text-slate-300 uppercase mx-1">até</span>
                                    <input
                                        type="date"
                                        value={endDate}
                                        onChange={e => { setEndDate(e.target.value); setCurrentPage(1); }}
                                        className="bg-transparent border-none text-[10px] text-slate-600 outline-none focus:text-slate-900 w-full"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Status */}
                        <div className="flex flex-col gap-1">
                            <label className="text-[9px] text-slate-400 uppercase tracking-wider px-1">{t.common.status}</label>
                            <div className="flex bg-white border border-[#1c2d4f]/20 rounded-lg h-9 p-0.5 gap-0.5 shadow-sm">
                                {[
                                    { value: 'ALL', label: 'Todos' },
                                    { value: 'ABERTO', label: 'Aberto' },
                                    { value: 'APROVADO', label: 'Aprovado' },
                                    { value: 'CONVERTIDO', label: 'Convertido' },
                                    { value: 'REJEITADO', label: 'Rejeitado' },
                                ].map(opt => (
                                    <button
                                        key={opt.value}
                                        onClick={() => { setStatusFilter(opt.value); setCurrentPage(1); }}
                                        className={`flex-1 rounded-md text-[8px] font-medium uppercase tracking-wide transition-all whitespace-nowrap px-1 ${statusFilter === opt.value
                                            ? opt.value === 'ABERTO'
                                                ? 'bg-sky-500 text-white shadow-sm'
                                                : opt.value === 'APROVADO'
                                                    ? 'bg-emerald-500 text-white shadow-sm'
                                                    : opt.value === 'CONVERTIDO'
                                                        ? 'bg-indigo-500 text-white shadow-sm'
                                                        : opt.value === 'REJEITADO'
                                                            ? 'bg-rose-500 text-white shadow-sm'
                                                            : 'bg-slate-800 text-white shadow-sm'
                                            : 'text-slate-500 hover:bg-slate-50'
                                            }`}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Clear */}
                        <div className="flex items-end pb-0.5">
                            <button
                                onClick={() => { setSearchTerm(''); setStatusFilter('ALL'); setStartDate(''); setEndDate(''); setCurrentPage(1); }}
                                className="w-full h-9 text-[10px] font-medium text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all border border-[#1c2d4f]/10 hover:border-rose-200 shadow-sm bg-white"
                            >
                                Limpar Filtros
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <div className="relative bg-white border border-slate-300/80 rounded-xl shadow-lg shadow-slate-200/50 flex flex-col overflow-hidden flex-1 ring-1 ring-slate-200/80">
                {/* 🔄 Page Transition Overlay — Big Tech Standard */}
                {(quotesFetching || isManualSyncing) && !quotesLoading && pagedQuotes.length > 0 && (
                    <div className="absolute inset-0 bg-white/70 backdrop-blur-[2px] z-20 flex items-center justify-center transition-opacity duration-200 animate-fade-in">
                        <div className="flex flex-col items-center gap-3">
                            <div className="w-8 h-8 border-[3px] border-slate-200 border-t-primary-500 rounded-full animate-spin" />
                            <p className="text-sm text-slate-500 uppercase tracking-widest">atualizando...</p>
                        </div>
                    </div>
                )}
                <div className="hidden md:block flex-1 overflow-auto custom-scrollbar os-table-container">
                    <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 bg-slate-100/90 backdrop-blur-md border-b border-slate-200 z-10 shadow-xs font-poppins">
                            <tr className="text-[10px] font-bold text-slate-500 uppercase tracking-wider text-left">
                                <th className="px-3 py-2 w-12 text-center text-slate-400">
                                    <input
                                        type="checkbox"
                                        className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                                        checked={pagedQuotes.length > 0 && pagedQuotes.every((q: any) => selectedQuoteIds.includes(q.id))}
                                        onChange={toggleSelectAll}
                                    />
                                </th>
                                <th className="px-4 py-3 text-center">Orçamento ID</th>
                                <th className="px-4 py-3 text-center">Criado em</th>
                                <th className="px-4 py-3 text-center">Cliente</th>
                                <th className="px-4 py-3 text-center">Validade</th>
                                <th className="px-4 py-3 text-center">Valor Total</th>
                                <th className="px-4 py-3 text-center">Vínculo O.S.</th>
                                <th className="px-4 py-3 text-center">{t.common.status}</th>
                                <th className="px-4 py-3 text-center">{t.common.actions}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {quotesLoading ? (
                                <tr>
                                    <td colSpan={9} className="py-16 text-center">
                                        <div className="flex flex-col items-center gap-3 text-slate-400">
                                            <Loader2 size={28} className="animate-spin text-primary-400" />
                                            <p className="text-[10px] font-semibold uppercase tracking-widest">Carregando orçamentos...</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : pagedQuotes.map(quote => (
                                <tr
                                    key={quote.id}
                                    className={`bg-white hover:bg-primary-50/40 border-b border-slate-50 transition-all group last:border-0 shadow-sm hover:shadow-md cursor-pointer ${selectedQuoteIds.includes(quote.id) ? 'bg-indigo-50/40' : ''}`}
                                    onClick={() => { setViewQuote(quote); setIsViewModalOpen(true); }}
                                >
                                    <td className="px-3 py-2 text-center shrink-0 w-12" onClick={(e) => { e.stopPropagation(); setSelectedQuoteIds(prev => prev.includes(quote.id) ? prev.filter(id => id !== quote.id) : [...prev, quote.id]); }}>
                                        <input
                                            type="checkbox"
                                            className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                                            checked={selectedQuoteIds.includes(quote.id)}
                                            readOnly
                                        />
                                    </td>
                                    <td className="px-4 py-1.5">
                                        <div className="flex flex-col items-center truncate max-w-[140px]">
                                            <span className="text-[13px] font-medium text-primary-600 tracking-tighter truncate" title={quote.id}>
                                                {getQuoteDisplayId(quote)}
                                            </span>
                                            <span className="text-[12px] text-slate-500 truncate">{quote.title}</span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-1.5">
                                        <div className="flex justify-center items-center gap-1.5 whitespace-nowrap">
                                            <Clock size={12} className="text-slate-400" />
                                            <span className="text-[12px] text-slate-600">{new Date(quote.createdAt).toLocaleDateString()}</span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-1.5 text-[12px] text-center text-slate-700 truncate max-w-[150px]">{quote.customerName}</td>
                                    <td className="px-4 py-1.5">
                                        <div className="flex justify-center items-center gap-1.5 whitespace-nowrap">
                                            <Calendar size={12} className="text-slate-400" />
                                            <span className="text-[12px] text-slate-600">{quote.validUntil ? new Date(quote.validUntil).toLocaleDateString() : 'N/D'}</span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-1.5 text-[13px] text-center font-medium text-emerald-600 whitespace-nowrap">R$ {quote.totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                    <td className="px-4 py-1.5 text-[12px] text-center text-slate-600 whitespace-nowrap">
                                        {quote.linkedOrderId ? (() => {
                                            const linkedOrder = orders.find(o => o.id === quote.linkedOrderId || o.displayId === quote.linkedOrderId);
                                            const label = linkedOrder?.displayId || linkedOrder?.id?.slice(0, 10) || quote.linkedOrderId.slice(0, 10);
                                            return (
                                                <div className="flex justify-center">
                                                    <span className="px-1.5 py-0.5 bg-slate-50 text-[#1c2d4f] rounded-lg border border-slate-200 flex items-center gap-1 w-fit" title={quote.linkedOrderId}>
                                                        <Link2 size={10} /> {label}
                                                    </span>
                                                </div>
                                            );
                                        })() : (
                                            <span className="text-slate-300">Sem Vínculo</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-1.5 text-center whitespace-nowrap">
                                        {quote.billingStatus === 'PAID' ? (
                                            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-medium bg-emerald-900 text-emerald-300 border border-emerald-700">
                                                <span className="w-1 h-1 rounded-full bg-emerald-400" />
                                                Faturado
                                            </div>
                                        ) : (
                                            <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-medium ${quote.status === 'ABERTO' ? 'bg-primary-50 text-primary-600 border border-primary-100' :
                                                quote.status === 'APROVADO' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' :
                                                    quote.status === 'CONVERTIDO' ? 'bg-slate-900 text-emerald-400 border border-slate-700' :
                                                        'bg-rose-50 text-rose-500 border border-rose-100'
                                                }`}>
                                                <span className={`w-1 h-1 rounded-full animate-pulse ${quote.status === 'ABERTO' ? 'bg-primary-600' : quote.status === 'APROVADO' ? 'bg-emerald-600' : quote.status === 'CONVERTIDO' ? 'bg-emerald-400' : 'bg-rose-500'}`} />
                                                {quote.status}
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-4 py-2 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                                        <div className="flex justify-center items-center gap-1">
                                            <button
                                                onClick={() => {
                                                    setViewQuote(quote);
                                                    setIsViewModalOpen(true);
                                                }}
                                                className="p-1 text-slate-400 hover:text-primary-700 hover:bg-primary-50 rounded transition-colors"
                                                title="Visualizar Orçamento"
                                            >
                                                <Eye size={14} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* 📱 MOBILE CARDS VIEW */}
                <div className="md:hidden flex-1 overflow-auto custom-scrollbar bg-slate-50/50 p-2 space-y-2 pb-28">
                    {quotesLoading ? (
                        <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                            <Loader2 size={28} className="animate-spin text-primary-400 mb-3" />
                            <p className="text-[10px] font-semibold uppercase tracking-widest">Carregando...</p>
                        </div>
                    ) : pagedQuotes.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                            <FileText size={32} className="text-slate-300 mb-3" />
                            <p className="text-[10px] font-semibold uppercase tracking-widest">Nenhum orçamento</p>
                        </div>
                    ) : (
                        pagedQuotes.map(quote => (
                            <div 
                                key={quote.id}
                                className={`bg-white p-3 rounded-2xl shadow-sm border ${selectedQuoteIds.includes(quote.id) ? 'border-primary-400 ring-1 ring-primary-100' : 'border-slate-200/60'} active:scale-[0.98] transition-all flex flex-col gap-2 relative overflow-hidden`}
                                onClick={() => { setViewQuote(quote); setIsViewModalOpen(true); }}
                            >
                                <div 
                                    className="absolute top-3 right-3 p-2 -m-2 z-10"
                                    onClick={(e) => { 
                                        e.stopPropagation(); 
                                        setSelectedQuoteIds(prev => prev.includes(quote.id) ? prev.filter(id => id !== quote.id) : [...prev, quote.id]);
                                    }}
                                >
                                    <input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-primary-600" checked={selectedQuoteIds.includes(quote.id)} readOnly />
                                </div>

                                <div className="flex items-start justify-between gap-2 pr-8">
                                    <div className="flex flex-col gap-1">
                                        <span className="text-[13px] font-bold text-primary-600 tracking-tighter w-max">
                                            {getQuoteDisplayId(quote)}
                                        </span>
                                        <h3 className="text-sm font-bold text-slate-800 line-clamp-1">{quote.customerName}</h3>
                                    </div>
                                </div>
                                
                                <div className="grid grid-cols-2 gap-2 mt-2">
                                    <div className="flex flex-col gap-0.5">
                                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Valor</span>
                                        <span className="text-sm font-bold text-emerald-600">R$ {quote.totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                    </div>
                                    <div className="flex flex-col gap-0.5">
                                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Criado em</span>
                                        <span className="text-xs font-bold text-slate-600">{new Date(quote.createdAt).toLocaleDateString()}</span>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                                    <span className="text-[10px] text-slate-500 truncate max-w-[150px]">{quote.title}</span>
                                    {quote.billingStatus === 'PAID' ? (
                                        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-medium bg-emerald-900 text-emerald-300 border border-emerald-700">
                                            <span className="w-1 h-1 rounded-full bg-emerald-400" />
                                            Faturado
                                        </div>
                                    ) : (
                                        <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-medium ${quote.status === 'ABERTO' ? 'bg-primary-50 text-primary-600 border border-primary-100' :
                                            quote.status === 'APROVADO' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' :
                                                quote.status === 'CONVERTIDO' ? 'bg-slate-900 text-emerald-400 border border-slate-700' :
                                                    'bg-rose-50 text-rose-500 border border-rose-100'
                                            }`}>
                                            <span className={`w-1 h-1 rounded-full animate-pulse ${quote.status === 'ABERTO' ? 'bg-primary-600' : quote.status === 'APROVADO' ? 'bg-emerald-600' : quote.status === 'CONVERTIDO' ? 'bg-emerald-400' : 'bg-rose-500'}`} />
                                            {quote.status}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* MOBILE FAB (Floating Action Button) */}
                {canCreate('quotes') && (
                    <button
                        onClick={(e) => {
                            resetForm(); setIsModalOpen(true);
                        }}
                        className="md:hidden fixed bottom-24 right-4 w-14 h-14 bg-gradient-to-tr from-[#10b981] to-[#059669] text-white rounded-full shadow-[0_8px_30px_rgba(16,185,129,0.4)] flex items-center justify-center z-50 active:scale-90 transition-transform"
                    >
                        <Plus size={24} />
                    </button>
                )}
                <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    totalItems={totalQuotes}
                    itemsPerPage={PAGE_SIZE}
                    onPageChange={setCurrentPage}
                />
            </div>

            {/* Modal Editor de Orçamento */}
            {isModalOpen && createPortal(
                <div className="fixed inset-0 z-[1200] flex items-end md:items-center justify-center bg-slate-900/60 backdrop-blur-sm p-0 md:p-8 overflow-hidden animate-in fade-in duration-300">
                    <div className="bg-white md:rounded-2xl w-full max-w-6xl h-full md:h-[92vh] shadow-2xl md:border border-slate-200 overflow-hidden flex flex-col animate-in slide-in-from-bottom-8 md:slide-in-from-bottom-0 md:zoom-in-95 duration-300">
                        <div className="px-8 py-5 border-b border-slate-200 flex justify-between items-center bg-white">
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 bg-slate-50 rounded-lg flex items-center justify-center text-[#1c2d4f] border border-slate-200">
                                    <Calculator size={18} />
                                </div>
                                <div>
                                    <h2 className="text-lg font-medium text-slate-900 tracking-tight">
                                        {selectedQuote ? 'Ajustar Proposta Comercial' : 'Nova Proposta Comercial'}
                                    </h2>
                                    <p className="text-[10px] font-medium text-slate-400 mt-0.5 uppercase">NEXUS VENDAS • GESTÃO DE PROPOSTAS</p>
                                </div>
                            </div>
                            <button onClick={() => setIsModalOpen(false)} className="p-2 text-slate-400 hover:text-rose-600 transition-all rounded-lg hover:bg-rose-50">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="flex-1 flex flex-col md:flex-row overflow-hidden bg-white">

                            {/* DESKTOP SIDEBAR TABS */}
                            <div className="hidden md:flex flex-col w-56 border-r border-slate-200 bg-slate-50/80 p-3 gap-1 overflow-y-auto custom-scrollbar shrink-0">
                                <div className="text-[9px] font-semibold text-slate-400 uppercase tracking-widest mb-2 px-2">Navegação</div>
                                {[
                                    { id: 'gerais', label: 'Dados Gerais', icon: FileText },
                                    { id: 'produtos', label: `Produtos e Serviços${items.length > 0 ? ` (${items.length})` : ''}`, icon: ListPlus }
                                ].map(tab => (
                                    <button
                                        key={tab.id}
                                        onClick={() => setActiveModalTab(tab.id as 'gerais' | 'produtos')}
                                        className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-medium transition-all w-full text-left font-poppins
                                        ${activeModalTab === tab.id
                                                ? 'bg-[#1c2d4f] text-white shadow-md ring-1 ring-[#1c2d4f]'
                                                : 'text-slate-500 hover:bg-white hover:text-[#1c2d4f] hover:shadow-sm'}`}
                                    >
                                        <tab.icon size={15} className={activeModalTab === tab.id ? 'text-white' : 'text-slate-400 shrink-0'} />
                                        <span className="flex-1 truncate">{tab.label}</span>
                                    </button>
                                ))}
                            </div>

                            {/* MOBILE TABS */}
                            <div className="md:hidden border-b border-slate-200 bg-white p-3 flex gap-2 overflow-x-auto custom-scrollbar shrink-0">
                                {[
                                    { id: 'gerais', label: 'Dados Gerais', icon: FileText },
                                    { id: 'produtos', label: `Produtos e Serviços${items.length > 0 ? ` (${items.length})` : ''}`, icon: ListPlus }
                                ].map(tab => (
                                    <button
                                        key={tab.id}
                                        onClick={() => setActiveModalTab(tab.id as 'gerais' | 'produtos')}
                                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-medium transition-all whitespace-nowrap font-poppins
                                        ${activeModalTab === tab.id
                                                ? 'bg-[#1c2d4f] text-white shadow-md'
                                                : 'bg-slate-50 text-slate-500 border border-slate-200'}`}
                                    >
                                        <tab.icon size={14} className={activeModalTab === tab.id ? 'text-white' : 'text-slate-400'} />
                                        {tab.label}
                                    </button>
                                ))}
                            </div>

                            {/* CONTENT AREA */}
                            <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-slate-50/50 custom-scrollbar flex flex-col">
                                {activeModalTab === 'gerais' && (
                                    <div className="max-w-4xl space-y-4">
                                        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                                            <h3 className="text-sm font-medium text-slate-900 border-l-4 border-[#1c2d4f] pl-3 uppercase">dados básicos</h3>

                                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                                                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex flex-col justify-center">
                                                    <label className="text-[10px] font-medium text-slate-400 uppercase block mb-1">Identificador</label>
                                                    <p className="text-base font-bold text-[#1c2d4f] tracking-tight">{previewId}</p>
                                                </div>

                                                <div className="space-y-1.5 relative lg:col-span-2">
                                                    <label className="text-[10px] font-medium text-slate-400 ml-1 uppercase">selecionar cliente</label>
                                                    <div className="relative">
                                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                                                        <input
                                                            type="text"
                                                            placeholder={customerName || "Buscar por Nome, CPF ou CNPJ..."}
                                                            value={isClientListOpen ? clientSearch : (customerName || clientSearch)}
                                                            onChange={e => {
                                                                setClientSearch(e.target.value);
                                                                setIsClientListOpen(true);
                                                                if (!e.target.value) setCustomerName('');
                                                            }}
                                                            onFocus={() => setIsClientListOpen(true)}
                                                            className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-10 py-2.5 text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-[#1c2d4f10] focus:border-[#1c2d4f] transition-all"
                                                        />
                                                        {customerName && !isClientListOpen && (
                                                            <button onClick={() => { setCustomerName(''); setClientSearch(''); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-rose-500">
                                                                <X size={14} />
                                                            </button>
                                                        )}
                                                    </div>
                                                    {isClientListOpen && (
                                                        <div className="absolute z-[1300] top-full mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-2xl max-h-48 overflow-y-auto custom-scrollbar animate-scale-up">
                                                            {filteredClients.length > 0 ? (
                                                                filteredClients.map(c => (
                                                                    <button
                                                                        key={c.id}
                                                                        onClick={() => {
                                                                            setCustomerName(c.name);
                                                                            setClientSearch(c.name);
                                                                            setIsClientListOpen(false);
                                                                        }}
                                                                        className="w-full text-left px-4 py-2 hover:bg-slate-50 border-b border-slate-100 last:border-0 transition-colors group"
                                                                    >
                                                                        <p className="text-xs font-medium text-slate-800 group-hover:text-[#1c2d4f]">{c.name}</p>
                                                                        <p className="text-[10px] text-slate-400 font-medium">{c.document || c.cnpj || c.cpf || 'Sem documento'}</p>
                                                                    </button>
                                                                ))
                                                            ) : (
                                                                <div className="p-4 text-center text-xs font-medium text-slate-400">Nenhum cliente localizado</div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                                <div className="space-y-1.5 lg:col-span-2">
                                                    <label className="text-[10px] font-medium text-slate-400 ml-1 uppercase">título da proposta</label>
                                                    <input
                                                        type="text"
                                                        value={title}
                                                        onChange={(e) => setTitle(e.target.value)}
                                                        placeholder="Ex: Manutenção Preventiva de Geradores..."
                                                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-[#1c2d4f10] focus:border-[#1c2d4f] transition-all"
                                                    />
                                                </div>
                                                <div className="space-y-1.5">
                                                    <label className="text-[10px] font-medium text-slate-400 ml-1 uppercase">validade</label>
                                                    <div className="relative">
                                                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                                                        <input
                                                            type="date"
                                                            value={validUntil}
                                                            onChange={(e) => setValidUntil(e.target.value)}
                                                            className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-[#1c2d4f10] focus:border-[#1c2d4f] transition-all"
                                                        />
                                                    </div>
                                                </div>
                                                <div className="space-y-1.5">
                                                    <label className="text-[10px] font-medium text-slate-400 ml-1 uppercase">vincular O.S.</label>
                                                    <div className="relative">
                                                        <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                                                        <select
                                                            value={linkedOrderId}
                                                            onChange={(e) => setLinkedOrderId(e.target.value)}
                                                            className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-[#1c2d4f10] focus:border-[#1c2d4f] transition-all appearance-none cursor-pointer"
                                                        >
                                                            <option value="">Nenhum Vínculo</option>
                                                            {customerOrders.map(o => (
                                                                <option key={o.id} value={o.displayId || o.id}>
                                                                    {o.displayId || o.id.slice(0, 8)} — {o.title}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {customerName && (() => {
                                            const c = customers.find(cust => cust.name === customerName);
                                            if (!c) return null;
                                            return (
                                                <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                                                    <h3 className="text-sm font-medium text-slate-900 border-l-4 border-emerald-500 pl-3 uppercase flex items-center gap-2">
                                                        <User size={16} className="text-emerald-500" /> Informações do Cliente
                                                    </h3>
                                                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                                                        <div className="space-y-1"><label className="text-[9px] font-medium text-slate-400 uppercase">CPF / CNPJ</label><p className="text-xs font-semibold text-slate-700 truncate">{c.document || '—'}</p></div>
                                                        <div className="space-y-1"><label className="text-[9px] font-medium text-slate-400 uppercase">{t.common.email}</label><p className="text-xs font-semibold text-slate-700 truncate">{c.email || '—'}</p></div>
                                                        <div className="space-y-1"><label className="text-[9px] font-medium text-slate-400 uppercase">{t.common.phone}</label><p className="text-xs font-semibold text-slate-700 truncate">{c.phone || '—'}</p></div>
                                                        <div className="space-y-1"><label className="text-[9px] font-medium text-slate-400 uppercase">WhatsApp</label><p className="text-xs font-semibold text-slate-700 truncate">{c.whatsapp || '—'}</p></div>
                                                        <div className="space-y-1 lg:col-span-4"><label className="text-[9px] font-medium text-slate-400 uppercase">Endereço Completo</label><p className="text-xs font-semibold text-slate-700 truncate">{[c.address, c.number, c.complement, c.neighborhood, c.city, c.state ? `/${c.state}` : null, c.zip ? `CEP: ${c.zip}` : null].filter(Boolean).join(' - ').replace(' - /', '/')}</p></div>
                                                    </div>
                                                </div>
                                            );
                                        })()}
                                        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                                            <h3 className="text-sm font-medium text-slate-900 border-l-4 border-amber-500 pl-3 uppercase">detalhamento</h3>
                                            <div className="space-y-1.5">
                                                <label className="text-[10px] font-medium text-slate-400 ml-1 uppercase">escopo técnico</label>
                                                <textarea
                                                    value={description}
                                                    onChange={(e) => setDescription(e.target.value)}
                                                    rows={2}
                                                    placeholder="Descreva detalhadamente o serviço..."
                                                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-[#1c2d4f10] focus:border-[#1c2d4f] transition-all resize-none custom-scrollbar"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {activeModalTab === 'produtos' && (
                                    <div className="flex-1 flex flex-col bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden min-h-[400px]">
                                        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-white z-10">
                                            <h3 className="text-sm font-medium text-slate-900 flex items-center gap-2">
                                                <ListPlus size={16} className="text-emerald-500" /> Itens e Composição
                                            </h3>
                                            <button onClick={handleAddItem} className="flex items-center gap-2 px-4 py-2 bg-[#1c2d4f] text-white rounded-xl text-xs font-medium hover:bg-[#253a66] transition-all shadow-md active:scale-95">
                                                <Plus size={16} /> Adicionar Item
                                            </button>
                                        </div>
                                        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50 custom-scrollbar">
                                            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-visible">
                                                <table className="w-full text-left table-fixed lg:table-auto overflow-visible">
                                                    <thead className="bg-slate-50 border-b border-slate-200">
                                                        <tr className="text-[10px] font-medium text-slate-400 uppercase">
                                                            <th className="px-6 py-3 w-28">Código</th>
                                                            <th className="px-4 py-3">Descrição / Item</th>
                                                            <th className="px-4 py-3 w-20 text-center">Qtd</th>
                                                            <th className="px-4 py-3 w-28">Unitário</th>
                                                            <th className="px-4 py-3 w-32 text-right">Subtotal</th>
                                                            <th className="px-6 py-3 w-16"></th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-100 overflow-visible">
                                                        {items.map((item, index) => (
                                                            <tr key={item.id} className={`hover:bg-slate-50/50 group transition-all ${isStockListOpen[index] ? 'z-[1400] relative bg-slate-50/80 shadow-sm' : 'z-auto'}`}>
                                                                <td className="px-6 py-4">
                                                                    <input
                                                                        placeholder="Opcional"
                                                                        value={item.stockCode || ''}
                                                                        onChange={e => updateItem(index, { stockCode: e.target.value })}
                                                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium py-1.5 px-3 font-mono tracking-wider text-[#3e5b99] uppercase"
                                                                    />
                                                                </td>
                                                                <td className="px-4 py-4">
                                                                    <div className="relative">
                                                                        <input
                                                                            placeholder="Buscar item ou descrever..."
                                                                            value={item.description}
                                                                            onFocus={() => setIsStockListOpen(prev => ({ ...prev, [index]: true }))}
                                                                            onChange={e => {
                                                                                updateItem(index, { description: e.target.value });
                                                                                setIsStockListOpen(prev => ({ ...prev, [index]: true }));
                                                                            }}
                                                                            className="w-full bg-transparent border-none text-sm font-semibold text-slate-700 outline-none p-0 focus:ring-0"
                                                                        />
                                                                        {isStockListOpen[index] && item.description.length > 0 && (
                                                                            <div className="absolute z-[1300] top-full left-0 w-[450px] mt-2 bg-white border border-slate-200 rounded-xl shadow-2xl max-h-60 overflow-y-auto custom-scrollbar animate-scale-up">
                                                                                <button
                                                                                    onClick={() => setIsStockListOpen(prev => ({ ...prev, [index]: false }))}
                                                                                    className="w-full text-left px-5 py-3 hover:bg-slate-50 border-b border-slate-100 bg-primary-50/50 text-[#1c2d4f] font-medium text-[11px] uppercase transition-colors flex items-center justify-between"
                                                                                >
                                                                                    <span>Usar como item avulso: "{item.description.slice(0, 25)}..."</span>
                                                                                    <Plus size={14} />
                                                                                </button>
                                                                                {stockItems
                                                                                    .filter(s => s.active !== false && (
                                                                                        s.description.toLowerCase().includes(item.description.toLowerCase()) ||
                                                                                        (s.code && s.code.toLowerCase().includes(item.description.toLowerCase()))
                                                                                    ))
                                                                                    .map(s => (
                                                                                        <button
                                                                                            key={s.id}
                                                                                            onClick={() => {
                                                                                                updateItem(index, { description: s.description, unitPrice: s.sellPrice, stockCode: s.code });
                                                                                                setIsStockListOpen(prev => ({ ...prev, [index]: false }));
                                                                                            }}
                                                                                            className="w-full text-left px-5 py-4 hover:bg-slate-50 border-b border-slate-50 last:border-0 transition-colors group/item"
                                                                                        >
                                                                                            <div className="flex justify-between items-start">
                                                                                                <div>
                                                                                                    <p className="text-xs font-medium text-slate-800 group-hover/item:text-[#1c2d4f]">{s.description}</p>
                                                                                                    <p className="text-[10px] text-slate-400 font-medium mt-0.5">SKU: {s.code}</p>
                                                                                                </div>
                                                                                                <p className="text-xs font-medium text-emerald-600">R$ {s.sellPrice?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                                                                            </div>
                                                                                        </button>
                                                                                    ))
                                                                                }
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </td>
                                                                <td className="px-4 py-4"><input type="number" value={item.quantity} onChange={e => updateItem(index, { quantity: Number(e.target.value) })} className="w-full bg-slate-50 border border-slate-200 rounded-lg text-center text-xs font-medium py-1.5" /></td>
                                                                <td className="px-4 py-4"><input type="number" value={item.unitPrice} onChange={e => updateItem(index, { unitPrice: Number(e.target.value) })} className="w-full bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium py-1.5 px-2" /></td>
                                                                <td className="px-4 py-4 text-right text-sm font-medium text-[#1c2d4f]">R$ {item.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                                                <td className="px-6 py-4"><button onClick={() => setItems(items.filter((_, i) => i !== index))} className="text-slate-300 hover:text-rose-600 transition-colors"><Trash2 size={16} /></button></td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                                {items.length === 0 && (
                                                    <div className="py-20 text-center flex flex-col items-center gap-4">
                                                        <ShoppingCart size={48} className="text-slate-200" />
                                                        <p className="text-sm font-medium text-slate-400">Nenhum item na proposta</p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="px-8 py-6 border-t border-slate-200 bg-white flex justify-between items-center bg-slate-50/50">
                            <div className="flex items-center gap-6">
                                {/* Resumo financeiro */}
                                <div className="space-y-1 min-w-[220px]">
                                    <div className="flex justify-between items-center gap-8">
                                        <p className="text-[10px] font-medium text-slate-400 uppercase">Subtotal</p>
                                        <p className="text-sm font-medium text-slate-600">R$ {subtotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                    </div>
                                    <div className="flex justify-between items-center gap-4">
                                        <p className="text-[10px] font-medium text-slate-400 uppercase">Desconto</p>
                                        <div className="flex items-center gap-1.5">
                                            {/* Toggle R$ / % */}
                                            <div className="flex border border-rose-200 rounded-lg overflow-hidden text-[9px] font-semibold">
                                                <button
                                                    onClick={() => setDiscountType('fixed')}
                                                    className={`px-2 py-1 transition-all ${discountType === 'fixed' ? 'bg-rose-500 text-white' : 'bg-white text-slate-400 hover:bg-rose-50'}`}
                                                >R$</button>
                                                <button
                                                    onClick={() => setDiscountType('percent')}
                                                    className={`px-2 py-1 transition-all ${discountType === 'percent' ? 'bg-rose-500 text-white' : 'bg-white text-slate-400 hover:bg-rose-50'}`}
                                                >%</button>
                                            </div>
                                            <input
                                                type="number"
                                                min={0}
                                                max={discountType === 'percent' ? 100 : subtotal}
                                                step={0.01}
                                                value={discount || ''}
                                                onChange={e => setDiscount(parseFloat(e.target.value) || 0)}
                                                placeholder="0"
                                                className="w-20 text-right text-sm font-medium text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-rose-300 transition-all"
                                            />
                                        </div>
                                    </div>
                                    {discountAmount > 0 && (
                                        <p className="text-[9px] text-rose-400 font-medium text-right">
                                            - R$ {discountAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </p>
                                    )}
                                    <div className="flex justify-between items-center gap-8 pt-1 border-t border-slate-200">
                                        <p className="text-[10px] font-medium text-slate-500 uppercase">Total</p>
                                        <p className="text-base font-semibold text-[#1c2d4f]">R$ {totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                    </div>
                                </div>
                            </div>
                            <div className="flex gap-4">
                                <button onClick={() => setIsModalOpen(false)} className="px-8 py-3 text-sm font-medium text-slate-500 hover:bg-slate-100 rounded-xl transition-all">{t.common.cancel}</button>
                                <button
                                    onClick={handleSaveQuote}
                                    disabled={!customerName || !title || items.length === 0 || loading}
                                    className="px-12 py-3 bg-[#1c2d4f] text-white rounded-xl text-sm font-medium shadow-lg hover:bg-[#253a66] disabled:opacity-50 transition-all active:scale-95 flex items-center gap-2"
                                >
                                    {loading ? <Loader2 size={18} className="animate-spin" /> : 'Confirmar e Salvar'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            , document.body)}

            {/* MODAL DE VISUALIZAÇÃO */}
            {isViewModalOpen && viewQuote && createPortal(
                <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in">
                    <div className="bg-white rounded-xl w-full max-w-6xl max-h-[92vh] shadow-2xl flex flex-col overflow-hidden border border-slate-200">

                        {/* HEADER — same pattern as Activity OS modal */}
                        <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center shrink-0 bg-white">
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-lg flex items-center justify-center border bg-slate-50 border-slate-200 text-slate-400">
                                    <FileText size={20} />
                                </div>
                                <div>
                                    <div className="flex items-center gap-3">
                                        <h2 className="text-base font-semibold text-slate-900 font-poppins">Orçamento #{getQuoteDisplayId(viewQuote)}</h2>
                                        <div className={`px-2.5 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wider ${viewQuote.status === 'APROVADO' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' :
                                            viewQuote.status === 'REJEITADO' ? 'bg-rose-50 text-rose-600 border border-rose-100' :
                                                viewQuote.status === 'CONVERTIDO' ? 'bg-slate-900 text-emerald-400 border border-slate-700' :
                                                    'bg-primary-50 text-primary-600 border border-primary-100'
                                            }`}>
                                            {viewQuote.status}
                                        </div>
                                    </div>
                                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                                        {viewQuote.customerName} • {viewQuote.customerAddress || 'Endereço não informado'}
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                {(() => {
                                    const isLocked = viewQuote.status === 'APROVADO' || viewQuote.status === 'CONVERTIDO' || viewQuote.billingStatus === 'PAID';
                                    return (
                                        <button
                                            onClick={(e) => {
                                                if (!canEdit('quotes')) { e.preventDefault(); showAlert('Acesso Negado: Você não tem permissão para editar.'); return; }
                                                if (isLocked) { e.preventDefault(); showAlert('Propostas aprovadas ou faturadas não podem ser editadas.'); return; }
                                                const quote = viewQuote;
                                                setSelectedQuote(quote);
                                                setCustomerName(quote.customerName);
                                                setTitle(quote.title);
                                                setDescription(quote.description);
                                                setItems(quote.items);
                                                setValidUntil(quote.validUntil || '');
                                                setDiscount(Number(quote.discount) || 0);
                                                setDiscountType(quote.discountType || 'fixed');
                                                setLinkedOrderId(quote.linkedOrderId || '');
                                                setIsViewModalOpen(false);
                                                setIsModalOpen(true);
                                            }}
                                            className={`h-9 px-4 gap-2 border rounded-lg text-xs font-medium transition-all flex items-center ${isLocked
                                                ? 'bg-slate-50 border-slate-100 text-slate-400 cursor-not-allowed opacity-60'
                                                : 'border-blue-200 text-blue-700 hover:bg-blue-50 active:scale-95 shadow-sm'
                                                } ${!canEdit('quotes') ? 'opacity-50 !cursor-not-allowed' : ''}`}
                                            title={isLocked ? "Propostas aprovadas ou faturadas não podem ser editadas" : "Editar proposta"}
                                        >
                                            {isLocked ? <Lock size={14} /> : <Edit3 size={14} />}
                                            {isLocked ? 'Bloqueado' : 'Editar'}
                                        </button>
                                    );
                                })()}
                                <button
                                    onClick={() => {
                                        const url = `${window.location.origin}/#/view-quote/${viewQuote.publicToken || viewQuote.id}`;
                                        window.open(url, '_blank');
                                    }}
                                    className="h-9 px-4 gap-2 border border-primary-200 text-primary-700 hover:bg-primary-50 rounded-lg text-xs font-medium transition-all flex items-center"
                                >
                                    <Eye size={14} /> Visualizar
                                </button>
                                <button
                                    onClick={handlePrintQuote}
                                    className="h-9 px-4 gap-2 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg text-xs font-medium transition-all flex items-center"
                                >
                                    <Printer size={14} /> Imprimir PDF
                                </button>
                                <button
                                    onClick={(e) => {
                                        if (!canDelete('quotes')) { e.preventDefault(); showAlert('Acesso Negado: Você não tem permissão para excluir.'); return; }
                                        if (viewQuote.status === 'APROVADO' || viewQuote.status === 'CONVERTIDO' || viewQuote.billingStatus === 'PAID') { e.preventDefault(); showAlert('Propostas aprovadas ou faturadas não podem ser excluídas.'); return; }
                                        showConfirm('Tem certeza que deseja excluir esta proposta?', async () => {
                                            await onDeleteQuote(viewQuote.id);
                                            setIsViewModalOpen(false);
                                        }, 'Excluir Proposta', 'Excluir', true);
                                    }}
                                    className={`h-9 px-4 gap-2 border rounded-lg text-xs font-medium transition-all flex items-center ${(viewQuote.status === 'APROVADO' || viewQuote.status === 'CONVERTIDO' || viewQuote.billingStatus === 'PAID')
                                        ? 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed'
                                        : 'bg-white hover:bg-rose-50 border-rose-200 text-rose-600 hover:text-rose-600 hover:border-rose-200'
                                        } ${!canDelete('quotes') ? 'opacity-50 !cursor-not-allowed' : ''}`}
                                >
                                    <Trash2 size={14} /> Excluir
                                </button>
                                <div className="h-6 w-px bg-slate-200 mx-2"></div>
                                <button onClick={() => setIsViewModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-900 transition-all">
                                    <X size={20} />
                                </button>
                            </div>
                        </div>

                        {/* CONTENT AREA */}
                        <div className="flex-1 overflow-y-auto p-8 bg-slate-50/50 custom-scrollbar">
                            <div className="grid grid-cols-12 gap-8">

                                {/* Left Column: Details */}
                                <div className="col-span-12 lg:col-span-8 space-y-6">

                                    {/* Client Info Card */}
                                    <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
                                        <h3 className="text-sm font-medium text-slate-900 mb-6 flex items-center gap-2">
                                            <User size={18} className="text-slate-400" /> Informações do Cliente
                                        </h3>
                                        {(() => {
                                            const c = customers.find(cust => cust.name === viewQuote.customerName);
                                            return (
                                                <div className="grid grid-cols-1 md:grid-cols-3 gap-y-6 gap-x-8">
                                                    <div className="space-y-1.5 md:col-span-2">
                                                        <label className="text-[11px] font-medium text-slate-400 mb-1 block px-1">Cliente / Razão Social</label>
                                                        <div className="text-sm font-semibold text-slate-900">{viewQuote.customerName}</div>
                                                    </div>
                                                    <div className="space-y-1.5">
                                                        <label className="text-[11px] font-medium text-slate-400 mb-1 block px-1">CPF / CNPJ</label>
                                                        <div className="text-sm text-slate-600 font-medium">{c?.document || viewQuote.customerDocument || 'Não informado'}</div>
                                                    </div>
                                                    <div className="space-y-1.5 md:col-span-2">
                                                        <label className="text-[11px] font-medium text-slate-400 mb-1 block px-1">Endereço Completo</label>
                                                        <div className="text-sm text-slate-600 font-medium leading-relaxed">
                                                            {c ? [c.address, c.number, c.complement, c.neighborhood, c.city, c.state ? `/${c.state}` : null, c.zip ? `CEP: ${c.zip}` : null].filter(Boolean).join(' - ').replace(' - /', '/') : (viewQuote.customerAddress || 'Não informado')}
                                                        </div>
                                                    </div>
                                                    <div className="space-y-1.5">
                                                        <label className="text-[11px] font-medium text-slate-400 mb-1 block px-1">{t.common.email}</label>
                                                        <div className="text-sm text-slate-600 font-medium break-all">{c?.email || 'Não informado'}</div>
                                                    </div>
                                                    <div className="space-y-1.5">
                                                        <label className="text-[11px] font-medium text-slate-400 mb-1 block px-1">{t.common.phone}</label>
                                                        <div className="text-sm text-slate-600 font-medium">{c?.phone || 'Não informado'}</div>
                                                    </div>
                                                    <div className="space-y-1.5">
                                                        <label className="text-[11px] font-medium text-slate-400 mb-1 block px-1">WhatsApp</label>
                                                        <div className="text-sm text-slate-600 font-medium">{c?.whatsapp || 'Não informado'}</div>
                                                    </div>
                                                    <div className="space-y-1.5">
                                                        <label className="text-[11px] font-medium text-slate-400 mb-1 block px-1">Validade da Proposta</label>
                                                        <div className="text-sm font-medium text-slate-700 flex items-center gap-2">
                                                            <Calendar size={14} className="text-slate-400" />
                                                            {viewQuote.validUntil ? new Date(viewQuote.validUntil).toLocaleDateString('pt-BR') : 'Não definida'}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })()}
                                    </div>

                                    {/* Description Card */}
                                    <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
                                        <h3 className="text-sm font-medium text-slate-900 mb-6 flex items-center gap-2">
                                            <FileText size={18} className="text-slate-400" /> Objeto da Proposta
                                        </h3>
                                        <div className="space-y-4">
                                            <div className="space-y-2">
                                                <label className="text-[11px] font-medium text-slate-400 mb-1 block px-1">Título</label>
                                                <div className="text-sm font-semibold text-slate-900">{viewQuote.title}</div>
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-[11px] font-medium text-slate-400 mb-1 block px-1">Descrição Detalhada</label>
                                                <div className="p-4 bg-slate-50/50 rounded-md border border-slate-100 text-sm text-slate-700 leading-relaxed whitespace-pre-wrap min-h-[80px] font-medium">
                                                    {viewQuote.description || 'Nenhuma observação técnica registrada.'}
                                                </div>
                                            </div>
                                            {viewQuote.notes && (
                                                <div className="space-y-2">
                                                    <label className="text-[11px] font-medium text-slate-400 mb-1 block px-1">Observações</label>
                                                    <div className="p-4 bg-primary-50 border border-primary-100 rounded-md text-sm font-medium text-slate-700 leading-relaxed">{viewQuote.notes}</div>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Items Table Card */}
                                    <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
                                        <div className="flex items-center justify-between mb-6">
                                            <h3 className="text-sm font-medium text-slate-900 flex items-center gap-2">
                                                <ListPlus size={18} className="text-slate-400" /> Itens e Serviços
                                            </h3>
                                            <span className="text-[10px] font-medium text-slate-400 uppercase tracking-widest">{viewQuote.items.length} {viewQuote.items.length === 1 ? 'Item' : 'Itens'}</span>
                                        </div>
                                        <div className="border border-slate-100 rounded-lg overflow-hidden">
                                            <table className="w-full text-left">
                                                <thead className="bg-slate-50 border-b border-slate-200">
                                                    <tr className="text-[10px] font-medium text-slate-400 uppercase">
                                                        <th className="px-4 py-3 w-12">#</th>
                                                        <th className="px-4 py-3">Descrição</th>
                                                        <th className="px-4 py-3 text-center w-20">Qtd</th>
                                                        <th className="px-4 py-3 w-28">Unitário</th>
                                                        <th className="px-4 py-3 text-right w-32">Subtotal</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100">
                                                    {viewQuote.items.map((item, idx) => (
                                                        <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                                                            <td className="px-4 py-4 text-xs font-medium text-slate-300">{String(idx + 1).padStart(2, '0')}</td>
                                                            <td className="px-4 py-4 text-sm font-semibold text-slate-700">{item.description}</td>
                                                            <td className="px-4 py-4 text-center text-xs font-medium text-slate-600">{item.quantity}</td>
                                                            <td className="px-4 py-4 text-xs font-medium text-slate-500">R$ {item.unitPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                                            <td className="px-4 py-4 text-right text-sm font-medium text-slate-900">R$ {item.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                        <div className="mt-4 flex flex-col items-end gap-2">
                                            {(() => {
                                                const subtotal = viewQuote.items.reduce((acc, item) => acc + (item.total || 0), 0);
                                                let discountValue = viewQuote.discountType === 'percent'
                                                    ? (subtotal * (Number(viewQuote.discount) || 0) / 100)
                                                    : (Number(viewQuote.discount) || 0);

                                                if (discountValue <= 0 && subtotal > (viewQuote.totalValue || subtotal)) {
                                                    discountValue = subtotal - (viewQuote.totalValue || subtotal);
                                                }

                                                return (
                                                    <>
                                                        <div className="bg-slate-50 border border-slate-100 px-6 py-3 rounded-lg flex flex-col gap-2 min-w-[300px]">
                                                            <div className="flex justify-between items-center w-full">
                                                                <span className="text-[10px] uppercase font-medium tracking-widest text-slate-400">Subtotal</span>
                                                                <span className="text-sm font-medium text-slate-600 font-mono">R$ {subtotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                                            </div>
                                                            {discountValue > 0 && (
                                                                <div className="flex justify-between items-center w-full pt-2 border-t border-slate-200/50">
                                                                    <span className="text-[10px] uppercase font-medium tracking-widest text-rose-400">Desconto {viewQuote.discountType === 'percent' ? `(${viewQuote.discount}%)` : ''}</span>
                                                                    <span className="text-sm font-medium text-rose-500 font-mono">- R$ {discountValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div className="bg-slate-900 text-white px-6 py-4 rounded-lg flex items-center justify-between gap-6 min-w-[300px] shadow-lg shadow-slate-900/10 mt-1">
                                                            <span className="text-[10px] font-medium uppercase tracking-widest opacity-60">Total Líquido</span>
                                                            <span className="text-2xl font-semibold tracking-tighter">R$ {viewQuote.totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                                        </div>
                                                    </>
                                                );
                                            })()}
                                        </div>
                                    </div>
                                </div>

                                {/* Right Column: Metadata */}
                                <div className="col-span-12 lg:col-span-4 space-y-6">

                                    {/* Timeline Card */}
                                    <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-lg shadow-slate-200/50">
                                        <h3 className="text-xs font-medium text-slate-900 uppercase tracking-tight mb-4 flex items-center gap-2">
                                            <Clock size={16} className="text-slate-400" /> Cronograma
                                        </h3>
                                        <div className="space-y-4">
                                            <div className="flex justify-between items-center pb-3 border-b border-slate-200">
                                                <span className="text-xs font-semibold text-slate-400">Criação</span>
                                                <span className="text-xs font-medium text-slate-700">{new Date(viewQuote.createdAt).toLocaleDateString('pt-BR')}</span>
                                            </div>
                                            <div className="flex justify-between items-center pb-3 border-b border-slate-200">
                                                <span className="text-xs font-semibold text-slate-400">Validade</span>
                                                <span className="text-xs font-medium text-[#1c2d4f]">{viewQuote.validUntil ? new Date(viewQuote.validUntil).toLocaleDateString('pt-BR') : 'N/D'}</span>
                                            </div>
                                            {viewQuote.status === 'APROVADO' && (
                                                <div className="p-3 bg-emerald-50 rounded-md border border-emerald-100">
                                                    <div className="flex justify-between items-center mb-1">
                                                        <span className="text-[10px] font-medium text-emerald-600 uppercase">Aprovação</span>
                                                    </div>
                                                    <div className="text-[11px] font-medium text-emerald-800">
                                                        {viewQuote.approvedAt ? new Date(viewQuote.approvedAt).toLocaleString('pt-BR') : 'Data não registrada'}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Link Card */}
                                    {viewQuote.linkedOrderId && (
                                        <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-lg shadow-slate-200/50">
                                            <h3 className="text-xs font-medium text-slate-900 uppercase tracking-tight mb-4 flex items-center gap-2">
                                                <Link2 size={16} className="text-slate-400" /> Vínculo
                                            </h3>
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 bg-primary-50 border border-primary-100 rounded-lg flex items-center justify-center shrink-0">
                                                    <Briefcase size={18} className="text-primary-400" />
                                                </div>
                                                <div>
                                                    <div className="text-sm font-medium text-slate-900">O.S. Vinculada</div>
                                                    <div className="text-xs font-medium text-slate-500">{viewQuote.linkedOrderId}</div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Approval Card */}
                                    {viewQuote.status === 'APROVADO' && (
                                        <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-lg shadow-slate-200/50">
                                            <h3 className="text-xs font-medium text-slate-900 uppercase tracking-tight mb-4 flex items-center gap-2">
                                                <ShieldCheck size={16} className="text-emerald-500" /> Aprovação
                                            </h3>
                                            <div className="space-y-4">
                                                <div className="space-y-1.5">
                                                    <label className="text-[11px] font-medium text-slate-400 block">Aprovado por</label>
                                                    <div className="text-sm font-semibold text-slate-900">{viewQuote.approvedByName}</div>
                                                </div>

                                                {viewQuote.approvalLatitude && (
                                                    <div className="space-y-1.5">
                                                        <label className="text-[11px] font-medium text-slate-400 block">Geo-Registro</label>
                                                        <a
                                                            href={`https://www.google.com/maps?q=${viewQuote.approvalLatitude},${viewQuote.approvalLongitude}`}
                                                            target="_blank"
                                                            className="text-xs font-medium text-primary-600 hover:underline flex items-center gap-1.5"
                                                        >
                                                            <MapPin size={12} /> Ver no Mapa
                                                        </a>
                                                    </div>
                                                )}

                                                {/* Signature */}
                                                <div className="pt-4 border-t border-slate-100">
                                                    <label className="text-[11px] font-medium text-slate-400 block mb-3">Assinatura Digital</label>
                                                    {viewQuote.approvalSignature ? (
                                                        <div className="bg-slate-50 border border-slate-100 rounded-lg p-4 flex items-center justify-center">
                                                            <img src={viewQuote.approvalSignature} alt="Assinatura" className="h-16 grayscale" />
                                                        </div>
                                                    ) : (
                                                        <div className="bg-slate-50 border border-dashed border-slate-200 rounded-lg p-6 flex flex-col items-center gap-2 opacity-30">
                                                            <SignatureIcon size={24} />
                                                            <p className="text-[10px] font-medium uppercase">Indisponível</p>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Metadata */}
                                                {viewQuote.approvalMetadata && (
                                                    <div className="pt-4 border-t border-slate-100">
                                                        <label className="text-[11px] font-medium text-slate-400 block mb-3">Evidências Técnicas</label>
                                                        <div className="space-y-2">
                                                            <div className="flex justify-between items-center bg-slate-50 px-3 py-2 rounded-md border border-slate-100">
                                                                <span className="text-[10px] font-semibold text-slate-400">Plataforma</span>
                                                                <span className="text-[10px] font-medium text-slate-700">{viewQuote.approvalMetadata.platform}</span>
                                                            </div>
                                                            <div className="flex justify-between items-center bg-slate-50 px-3 py-2 rounded-md border border-slate-100">
                                                                <span className="text-[10px] font-semibold text-slate-400">IP</span>
                                                                <span className="text-[10px] font-medium text-slate-700">{viewQuote.approvalMetadata.ip || '---'}</span>
                                                            </div>
                                                            <div className="bg-slate-50 px-3 py-2 rounded-md border border-slate-100">
                                                                <p className="text-[9px] font-semibold text-slate-400 mb-0.5">User Agent</p>
                                                                <p className="text-[9px] text-slate-500 truncate">{viewQuote.approvalMetadata.userAgent}</p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>

                            </div>
                        </div>
                    </div>
                </div>
            , document.body)}

            {/* ── HIDDEN PRINT CONTAINER ── */}
            {viewQuote && (
                <div className="hidden print:hidden" id="quote-print-container">
                    <QuotePrintLayout quote={viewQuote} tenant={tenant} />
                </div>
            )}
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// QUOTE PRINT LAYOUT — Mirrors the OS PrintLayout structure exactly
// ─────────────────────────────────────────────────────────────────────────────
const QuotePrintLayout: React.FC<{ quote: Quote; tenant: any }> = ({ quote, tenant }) => {
    const companyName = tenant?.company_name || tenant?.name || tenant?.companyName || 'Nexus Pro';
    const companyLogo = tenant?.logo_url || tenant?.logoUrl;
    const companyAddress = useMemo(() => {
        if (!tenant) return '';
        // Prioritiza campos individuais, fallbacks para 'address'
        const street = tenant.street || tenant.address || '';
        if (!street) return '';

        const parts = [];
        parts.push(street);
        if (tenant.number) parts.push(`, ${tenant.number}`);
        if (tenant.complement) parts.push(` - ${tenant.complement}`);
        if (tenant.neighborhood) parts.push(` - ${tenant.neighborhood}`);
        if (tenant.city) parts.push(`, ${tenant.city}`);
        if (tenant.state) parts.push(`/${tenant.state}`);

        return parts.join('');
    }, [tenant]);

    const companyPhone = tenant?.phone || '';
    const companyEmail = tenant?.admin_email || tenant?.email || '';
    const companyDoc = tenant?.cnpj || tenant?.document || '';

    useEffect(() => {
        if (tenant) {
            console.log('[QuotePrintLayout] Tenant data:', {
                name: companyName,
                address: companyAddress,
                street: tenant.street,
                rawAddress: tenant.address
            });
        }
    }, [tenant, companyName, companyAddress]);

    const fmt = (d?: string) => {
        if (!d) return '—';
        const date = d.includes('T') ? new Date(d) : new Date(d + 'T12:00:00');
        return date.toLocaleDateString('pt-BR');
    };

    return (
        <div className="bg-white text-[10px] leading-tight font-poppins p-6 print:break-inside-avoid" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact', overflow: 'hidden', width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
            {/* Print Header — same as OS */}
            <div className="flex justify-between items-start pb-4 border-b-2 border-slate-800 mb-4">
                <div className="flex gap-4 items-center">
                    {companyLogo
                        ? <img src={companyLogo} alt="Logo" className="h-16 w-auto object-contain" />
                        : <div className="bg-slate-900 p-2 rounded-lg flex items-center justify-center min-w-[60px] min-h-[60px] text-white"><Hexagon size={32} className="text-white fill-white/10" /></div>
                    }
                    <div className="space-y-1">
                        <h1 className="text-xl font-medium text-slate-900 uppercase tracking-tight">{companyName}</h1>
                        <div className="text-[9px] text-slate-600 max-w-[400px]">
                            {companyAddress && <div>{companyAddress}</div>}
                            <div className="flex gap-3 mt-0.5">
                                {companyPhone && <span className="font-semibold">Tel: {companyPhone}</span>}
                                {companyEmail && <span>Email: {companyEmail}</span>}
                            </div>
                            {companyDoc && <div className="mt-0.5">CNPJ: {companyDoc}</div>}
                        </div>
                    </div>
                </div>
                <div className="text-right shrink-0">
                    <div className="border-2 border-slate-800 px-5 py-2 rounded-lg bg-slate-50 min-w-[160px]">
                        <div className="text-[8px] font-medium text-slate-500 uppercase tracking-wider mb-1">Proposta Comercial</div>
                        <div className="text-base font-semibold text-slate-900 tracking-tight whitespace-nowrap">{quote.displayId || quote.id.slice(0, 8).toUpperCase()}</div>
                    </div>
                    <div className="text-[8px] font-medium text-slate-400 mt-2 uppercase tracking-wide">
                        Emissão: {new Date().toLocaleDateString()} às {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                </div>
            </div>

            <div className="space-y-3">
                {/* Dados do Cliente */}
                <div className="border border-slate-300 rounded-lg overflow-hidden break-inside-avoid">
                    <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-300 font-medium text-[9px] uppercase tracking-wider text-slate-700">Dados do Cliente e Proposta</div>
                    <div className="grid grid-cols-12 divide-x divide-slate-200">
                        <div className="col-span-7 p-2.5 space-y-2">
                            <div><label className="block text-[8px] font-medium text-slate-400 uppercase">Cliente</label><div className="font-medium text-slate-900 text-sm uppercase">{quote.customerName}</div></div>
                            <div><label className="block text-[8px] font-medium text-slate-400 uppercase">Endereço</label><div className="font-medium text-slate-700 text-xs uppercase">{quote.customerAddress || 'N/A'}</div></div>
                            {quote.customerDocument && (
                                <div><label className="block text-[8px] font-medium text-slate-400 uppercase">CPF / CNPJ</label><div className="font-medium text-slate-700 text-xs">{quote.customerDocument}</div></div>
                            )}
                        </div>
                        <div className="col-span-5 p-2.5 grid grid-cols-2 gap-3 bg-slate-50/30">
                            <div><label className="block text-[8px] font-medium text-slate-400 uppercase">Criação</label><div className="font-medium">{fmt(quote.createdAt)}</div></div>
                            <div><label className="block text-[8px] font-medium text-slate-400 uppercase">Validade</label><div className="font-medium">{quote.validUntil ? fmt(quote.validUntil) : '—'}</div></div>
                            <div><label className="block text-[8px] font-medium text-slate-400 uppercase">Status</label><div className="font-medium text-[9px] border border-slate-200 px-1.5 py-0.5 rounded inline-block bg-white uppercase">{quote.status}</div></div>
                            {quote.linkedOrderId && (
                                <div><label className="block text-[8px] font-medium text-slate-400 uppercase">O.S. Vinculada</label><div className="font-medium uppercase">{quote.linkedOrderId.slice(0, 8)}</div></div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Objeto / Descrição */}
                <div className="border border-slate-300 rounded-lg overflow-hidden break-inside-avoid">
                    <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-300 font-medium text-[9px] uppercase tracking-wider text-slate-700">Objeto da Proposta</div>
                    <div className="p-3 bg-white space-y-2">
                        <div><label className="block text-[8px] font-medium text-slate-400 uppercase">Título</label><div className="font-medium text-slate-900 text-xs uppercase">{quote.title}</div></div>
                        {quote.description && (
                            <div><label className="block text-[8px] font-medium text-slate-400 uppercase mt-2">Descrição</label><div className="text-[11px] text-slate-800 font-medium whitespace-pre-wrap leading-relaxed">{quote.description}</div></div>
                        )}
                    </div>
                </div>

                {/* Itens / Composição */}
                <div className="border border-slate-300 rounded-lg" style={{ overflow: 'hidden', width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
                    <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-300 font-medium text-[9px] uppercase tracking-wider text-slate-700">Composição da Proposta (Itens e Serviços)</div>
                    <table style={{ width: '100%', maxWidth: '100%', tableLayout: 'fixed', borderCollapse: 'collapse', boxSizing: 'border-box' }}>
                        <colgroup>
                            <col style={{ width: '5%' }} />
                            <col style={{ width: '12%' }} />
                            <col style={{ width: '38%' }} />
                            <col style={{ width: '9%' }} />
                            <col style={{ width: '18%' }} />
                            <col style={{ width: '18%' }} />
                        </colgroup>
                        <thead>
                            <tr className="bg-slate-50 text-[8px] font-semibold text-slate-500 uppercase border-b border-slate-200">
                                <th className="px-2 py-2">#</th>
                                <th className="px-2 py-2 text-left">Código</th>
                                <th className="px-2 py-2 text-left">Descrição do Item</th>
                                <th className="px-2 py-2 text-center">Qtd</th>
                                <th className="px-2 py-2 text-right">V. Unitário</th>
                                <th className="px-2 py-2 text-right">Total</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 bg-white">
                            {quote.items.map((item, idx) => (
                                <tr key={idx} className="break-inside-avoid">
                                    <td className="px-2 py-2 text-[10px] font-medium text-slate-400 align-top">{String(idx + 1).padStart(2, '0')}</td>
                                    <td className="px-2 py-2 text-[9px] font-medium text-[#3e5b99] align-top font-mono tracking-wider uppercase" style={{ wordBreak: 'break-all', overflow: 'hidden' }}>
                                        {item.stockCode || <span style={{ color: '#cbd5e1', fontStyle: 'italic', fontWeight: 400 }}>—</span>}
                                    </td>
                                    <td className="px-2 py-2 text-[10px] uppercase font-medium text-slate-800 align-top" style={{ wordWrap: 'break-word', overflowWrap: 'break-word', overflow: 'hidden' }}>{item.description}</td>
                                    <td className="px-2 py-2 text-[10px] text-center font-medium text-slate-600 align-top">{item.quantity}</td>
                                    <td className="px-2 py-2 text-[10px] text-right text-slate-600 font-mono" style={{ overflow: 'hidden' }}>R$ {item.unitPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                    <td className="px-2 py-2 text-[10px] text-right font-semibold text-slate-900 font-mono" style={{ overflow: 'hidden' }}>R$ {item.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <div className="bg-slate-50 border-t border-slate-200 divide-y divide-slate-100">
                        {(() => {
                            const subtotal = quote.items.reduce((acc, item) => acc + (item.total || 0), 0);
                            let discountValue = quote.discountType === 'percent'
                                ? (subtotal * (Number(quote.discount) || 0) / 100)
                                : (Number(quote.discount) || 0);

                            if (discountValue <= 0 && subtotal > (quote.totalValue || subtotal)) {
                                discountValue = subtotal - (quote.totalValue || subtotal);
                            }

                            return (
                                <>
                                    <div className="px-6 py-2 flex justify-end gap-12 items-center">
                                        <span className="text-[8px] uppercase font-medium tracking-widest text-slate-400">Subtotal Bruto</span>
                                        <span className="text-[10px] font-medium text-slate-600 font-mono">R$ {subtotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                    </div>
                                    {discountValue > 0 && (
                                        <div className="px-6 py-2 flex justify-end gap-12 items-center">
                                            <span className="text-[8px] uppercase font-medium tracking-widest text-rose-400 italic">Desconto Aplicado ({quote.discountType === 'percent' ? `${quote.discount}%` : 'Fixo'})</span>
                                            <span className="text-[10px] font-medium text-rose-500 font-mono italic">- R$ {discountValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                        </div>
                                    )}
                                    <div className="bg-slate-800 text-white px-6 py-3 flex justify-end gap-12 items-center">
                                        <span className="text-[10px] uppercase font-semibold tracking-[0.2em] text-slate-300">Total Líquido</span>
                                        <span className="text-xl font-semibold tracking-tighter">R$ {quote.totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                    </div>
                                </>
                            );
                        })()}
                    </div>
                </div>

                {/* Observações */}
                {quote.notes && (
                    <div className="border border-slate-300 rounded-lg overflow-hidden break-inside-avoid">
                        <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-300 font-medium text-[9px] uppercase tracking-wider text-slate-700">Observações e Condições</div>
                        <div className="p-3 bg-white text-[11px] text-slate-800 font-medium whitespace-pre-wrap leading-relaxed">
                            {quote.notes}
                        </div>
                    </div>
                )}

                {/* Aprovação / Recusa (Auditoria Digital) */}
                {(quote.status === 'APROVADO' || quote.status === 'CONVERTIDO' || quote.status === 'REJEITADO') ? (
                    <div className={`border rounded-lg overflow-hidden break-inside-avoid mt-4 ${quote.status === 'REJEITADO' ? 'border-rose-300' : 'border-emerald-300'}`}>
                        <div className={`${quote.status === 'REJEITADO' ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'} px-3 py-1.5 border-b font-medium text-[9px] uppercase tracking-wider`}>
                            {quote.status === 'REJEITADO' ? 'Formalização de Recusa — Auditoria Digital' : 'Validação e Assinaturas — Auditoria Digital'}
                        </div>
                        <div className="bg-white">
                            {quote.status === 'REJEITADO' && (
                                <div className="p-3 bg-rose-50/50 border-b border-rose-100 italic text-[11px] text-rose-900 font-medium uppercase">
                                    Motivo da Recusa: {quote.rejectionReason || 'Recusa efetuada via link público pelo cliente.'}
                                </div>
                            )}
                            <div className="grid grid-cols-2 divide-x divide-slate-300 text-center">
                                <div className="p-4 flex flex-col items-center justify-center gap-3">
                                    <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-widest">Emitente / Comercial</p>
                                    <div className="h-[60px] flex items-center justify-center text-slate-200 italic text-[10px] font-medium uppercase">
                                        Visto Eletrônico Nexus
                                    </div>
                                    <div className="w-full border-t border-slate-300 pt-2">
                                        <p className="text-[12px] font-semibold text-slate-900 uppercase">{companyName}</p>
                                    </div>
                                </div>
                                <div className="p-4 flex flex-col items-center justify-center gap-3">
                                    <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-widest">
                                        {quote.status === 'REJEITADO' ? 'Recusado pelo Cliente' : 'Aprovação do Cliente'}
                                    </p>
                                    <div className="h-[80px] flex items-center justify-center">
                                        {quote.approvalSignature ? (
                                            <img src={quote.approvalSignature} className="max-h-full max-w-full object-contain mix-blend-multiply" alt="Assinatura" />
                                        ) : (
                                            <span className="text-slate-300 italic text-[10px] font-medium uppercase">Registro digital certificado</span>
                                        )}
                                    </div>
                                    <div className="w-full border-t border-slate-300 pt-2">
                                        <p className="text-[12px] font-semibold text-slate-900 uppercase">{quote.approvedByName || 'Cliente'}</p>
                                        {quote.approvedAt && <p className="text-[9px] font-medium text-slate-500 uppercase tracking-widest">{new Date(quote.approvedAt).toLocaleString('pt-BR')}</p>}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="border border-slate-300 rounded-lg overflow-hidden break-inside-avoid mt-4">
                        <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-300 font-medium text-[9px] uppercase tracking-wider text-slate-700">Aceite e Conformidade</div>
                        <div className="grid grid-cols-2 divide-x divide-slate-300 bg-white text-center">
                            <div className="p-4 flex flex-col items-center justify-center gap-3">
                                <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-widest">Emitente</p>
                                <div className="h-[60px] flex items-center justify-center" />
                                <div className="w-full border-t border-slate-300 pt-2">
                                    <p className="text-[12px] font-semibold text-slate-900 uppercase">{companyName}</p>
                                </div>
                            </div>
                            <div className="p-4 flex flex-col items-center justify-center gap-3">
                                <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-widest">De Acordo — Assinatura do Cliente</p>
                                <div className="h-[80px] flex items-center justify-center" />
                                <div className="w-full border-t border-slate-300 pt-2">
                                    <p className="text-[12px] font-semibold text-slate-300 uppercase">Nome:</p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Footer — same as OS */}
            <div className="mt-8 pt-4 border-t-2 border-slate-800 flex justify-between items-center text-slate-500">
                <div className="flex items-center gap-2">
                    <NexusBranding size="lg" className="opacity-80 origin-left scale-75" />
                </div>
                <div className="text-right">
                    <p className="text-[8px] font-medium uppercase tracking-widest text-[#1c2d4f]">Uma solução DUNO</p>
                    <p className="text-[7px] uppercase tracking-tight mt-0.5">Documento emitido eletronicamente. Auditável na plataforma central.</p>
                </div>
            </div>
        </div>
    );
};
