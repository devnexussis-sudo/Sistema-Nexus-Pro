
import React, { useState, useMemo, useEffect } from 'react';
import {
    Search, Plus, FileText, DollarSign, Clock, CheckCircle,
    XCircle, MoreHorizontal, ArrowRight, Trash2, Edit3, Trash, Edit,
    ChevronRight, CreditCard, User, MapPin, Briefcase,
    ArrowUpRight, Loader2, ListPlus, Calculator, Inbox, Calendar, Link2, Share2,
    Eye, Link, ExternalLink, Globe, ClipboardCheck, ShieldCheck, Box, Signature as SignatureIcon,
    AlertCircle, ChevronLeft, Filter, FileSpreadsheet, X, Cpu, ShoppingCart, Printer
} from 'lucide-react';
import { Pagination } from '../ui/Pagination';
import { Customer, OrderStatus, OrderPriority, ServiceOrder, StockItem, Quote, QuoteItem } from '../../types';
import { usePagedQuotes } from '../../hooks/nexusHooks';
import { useAuth } from '../../contexts/AuthContext';

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
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isViewModalOpen, setIsViewModalOpen] = useState(false);
    const [isConverting, setIsConverting] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [showFilters, setShowFilters] = useState(false);
    const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);
    const [viewQuote, setViewQuote] = useState<Quote | null>(null);
    const [selectedQuoteIds, setSelectedQuoteIds] = useState<string[]>([]);

    const [currentPage, setCurrentPage] = useState(1);
    const PAGE_SIZE = 20;

    // ── Server-Side Pagination (Big Tech Standard) ──────────────
    const { session, isAuthLoading } = useAuth();
    const serverFilters = useMemo(() => ({
        search: searchTerm.trim() || undefined,
        status: undefined 
    }), [searchTerm]);

    const {
        data: pageResult,
        isLoading: quotesLoading,
    } = usePagedQuotes(currentPage, serverFilters, !isAuthLoading && !!session);

    const pagedQuotes = pageResult?.data ?? [];
    const totalQuotes = pageResult?.total ?? 0;
    const totalPages = pageResult?.lastPage ?? 1;

    // Form States
    const [customerName, setCustomerName] = useState('');
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [items, setItems] = useState<QuoteItem[]>([]);
    const [notes, setNotes] = useState('');
    const [validUntil, setValidUntil] = useState('');
    const [linkedOrderId, setLinkedOrderId] = useState('');

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

    const totalValue = useMemo(() => items.reduce((acc, curr) => acc + curr.total, 0), [items]);

    const getQuoteDisplayId = (quote: Quote): string => {
        if (quote.displayId) return quote.displayId;
        return `#${quote.id.slice(0, 8).toUpperCase()}`;
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
                customerName,
                customerAddress: customer?.address || '',
                customerDocument: customer?.document || '00000000000000',
                title,
                description,
                items,
                totalValue,
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
            alert(`Falha ao salvar orçamento: ${error.message || 'Erro desconhecido'}`);
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
        setLoading(false);
    };

    const handleConvertToOrder = async (quote: Quote) => {
        if (!window.confirm('Deseja converter este orçamento em uma Ordem de Serviço ativa?')) return;

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
            alert('Conversão realizada com sucesso!');
        } catch (e) {
            console.error(e);
            alert('Falha na conversão.');
        } finally {
            setIsConverting(false);
        }
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
        } else {
            itemsToExport = pagedQuotes;
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
        <div className="p-4 animate-fade-in flex flex-col h-full bg-slate-50/20 overflow-hidden font-poppins">
            <div className="mb-2 flex flex-col md:flex-row items-center gap-3">
                <div className="relative w-full md:flex-1">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input
                        type="text"
                        placeholder="Pesquisar por Código ou Cliente..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl pl-12 pr-6 py-3 text-[11px] font-bold text-slate-700 outline-none focus:ring-4 focus:ring-primary-100 transition-all shadow-sm"
                    />
                </div>

                {selectedQuoteIds.length === 0 && (
                    <div className="flex items-center gap-2 mr-auto" style={{ marginLeft: '1rem' }}>
                        <button
                            onClick={handleExportExcel}
                            className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl text-[10px] font-black uppercase hover:bg-emerald-600 hover:text-white transition-all shadow-sm border border-emerald-100/50"
                        >
                            <FileSpreadsheet size={14} /> Exportar Excel
                        </button>
                    </div>
                )}

                {selectedQuoteIds.length > 0 && (
                    <div className="flex items-center gap-3 px-4 py-1.5 bg-slate-900 rounded-[1.5rem] shadow-2xl animate-in fade-in slide-in-from-right-4 ring-4 ring-slate-100 mr-auto" style={{ marginLeft: '1rem' }}>
                        <div className="flex flex-col pr-3 border-r border-slate-700">
                            <span className="text-[9px] font-black text-slate-400 uppercase leading-none mb-0.5">Sel.</span>
                            <span className="text-xs font-black text-white leading-none">{selectedQuoteIds.length}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={handleExportExcel}
                                className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-white rounded-xl text-[10px] font-black uppercase transition-all shadow-lg shadow-emerald-500/20 active:scale-95"
                            >
                                <FileSpreadsheet size={14} /> Excel
                            </button>
                            <div className="w-px h-6 bg-slate-700 mx-1" />
                            <button
                                onClick={() => setSelectedQuoteIds([])}
                                className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
                            >
                                <X size={18} />
                            </button>
                        </div>
                    </div>
                )}

                <div className="flex items-center gap-2 ml-auto">
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className={`flex items-center gap-2 px-4 h-[46px] rounded-xl border transition-all text-[10px] font-bold ${showFilters ? 'bg-primary-50 border-primary-200 text-primary-600 shadow-inner' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50 shadow-sm'}`}
                    >
                        <Filter size={14} /> {showFilters ? 'Ocultar Filtros' : 'Filtros'}
                    </button>
                    <button
                        onClick={() => { resetForm(); setIsModalOpen(true); }}
                        className="px-6 py-3 h-[46px] bg-[#1c2d4f] text-white rounded-xl text-[10px] font-bold uppercase shadow-sm shadow-[#1c2d4f]/10 hover:bg-[#253a66] transition-all flex items-center gap-2 whitespace-nowrap"
                    >
                        <Plus size={16} /> Novo Orçamento
                    </button>
                </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-[2rem] overflow-hidden shadow-2xl shadow-slate-200/40 flex-1 flex flex-col min-h-0">
                <div className="flex-1 overflow-auto custom-scrollbar">
                    <table className="w-full border-separate border-spacing-y-0 text-left">
                        <thead className="sticky top-0 bg-slate-200/60 backdrop-blur-md z-10 text-[11px] font-semibold text-slate-600 border-b border-slate-300 font-poppins">
                            <tr className="border-b border-slate-200">
                                <th className="px-3 py-2 w-12 text-center text-slate-400">
                                    <input
                                        type="checkbox"
                                        className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                                        checked={pagedQuotes.length > 0 && pagedQuotes.every((q: any) => selectedQuoteIds.includes(q.id))}
                                        onChange={toggleSelectAll}
                                    />
                                </th>
                                <th className="px-4 py-3">Orçamento ID</th>
                                <th className="px-4 py-3">Criado em</th>
                                <th className="px-4 py-3">Cliente</th>
                                <th className="px-4 py-3">Validade</th>
                                <th className="px-4 py-3 text-right">Valor Total</th>
                                <th className="px-4 py-3">Vínculo O.S.</th>
                                <th className="px-4 py-3 text-center">Status</th>
                                <th className="px-4 py-3 text-right pr-6">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {quotesLoading ? (
                                <tr>
                                    <td colSpan={9} className="py-16 text-center">
                                        <div className="flex flex-col items-center gap-3 text-slate-400">
                                            <Loader2 size={28} className="animate-spin text-primary-400" />
                                            <p className="text-[10px] font-black uppercase tracking-widest">Carregando orçamentos...</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : pagedQuotes.map(quote => (
                                <tr key={quote.id} className={`bg-white hover:bg-primary-50/40 border-b border-slate-50 transition-all group last:border-0 shadow-sm hover:shadow-md ${selectedQuoteIds.includes(quote.id) ? 'bg-indigo-50/40' : ''}`}>
                                    <td className="px-3 py-2 text-center shrink-0 w-12" onClick={(e) => { e.stopPropagation(); setSelectedQuoteIds(prev => prev.includes(quote.id) ? prev.filter(id => id !== quote.id) : [...prev, quote.id]); }}>
                                        <input
                                            type="checkbox"
                                            className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                                            checked={selectedQuoteIds.includes(quote.id)}
                                            readOnly
                                        />
                                    </td>
                                    <td className="px-4 py-1.5">
                                        <div className="flex flex-col truncate max-w-[140px]">
                                            <span className="text-[13px] font-medium text-primary-600 tracking-tighter truncate" title={quote.id}>
                                                {getQuoteDisplayId(quote)}
                                            </span>
                                            <span className="text-[12px] text-slate-500 truncate">{quote.title}</span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-1.5">
                                        <div className="flex items-center gap-1.5 whitespace-nowrap">
                                            <Clock size={12} className="text-slate-400" />
                                            <span className="text-[12px] text-slate-600">{new Date(quote.createdAt).toLocaleDateString()}</span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-1.5 text-[12px] text-slate-700 truncate max-w-[150px]">{quote.customerName}</td>
                                    <td className="px-4 py-1.5">
                                        <div className="flex items-center gap-1.5 whitespace-nowrap">
                                            <Calendar size={12} className="text-slate-400" />
                                            <span className="text-[12px] text-slate-600">{quote.validUntil ? new Date(quote.validUntil).toLocaleDateString() : 'N/D'}</span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-1.5 text-[13px] font-medium text-emerald-600 whitespace-nowrap">R$ {quote.totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                    <td className="px-4 py-1.5 text-[12px] text-slate-600 whitespace-nowrap">
                                        {quote.linkedOrderId ? (() => {
                                            const linkedOrder = orders.find(o => o.id === quote.linkedOrderId || o.displayId === quote.linkedOrderId);
                                            const label = linkedOrder?.displayId || linkedOrder?.id?.slice(0, 10) || quote.linkedOrderId.slice(0, 10);
                                            return (
                                                <span className="px-1.5 py-0.5 bg-slate-50 text-[#1c2d4f] rounded-lg border border-slate-200 flex items-center gap-1 w-fit" title={quote.linkedOrderId}>
                                                    <Link2 size={10} /> {label}
                                                </span>
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
                                    <td className="px-6 py-2 text-right pr-6">
                                        <div className="flex justify-end gap-1.5">
                                            <button
                                                onClick={() => { setViewQuote(quote); setIsViewModalOpen(true); }}
                                                className="p-3 bg-slate-50/50 text-slate-400 hover:text-slate-900 hover:bg-white rounded-xl shadow-sm transition-all border border-transparent hover:border-slate-200 active:scale-95"
                                            >
                                                <Eye size={16} />
                                            </button>
                                            <button
                                                onClick={() => {
                                                    const url = `${window.location.origin}/#/view-quote/${quote.publicToken || quote.id}`;
                                                    window.open(url, '_blank');
                                                }}
                                                className="p-3 bg-emerald-50/50 text-emerald-500 hover:text-emerald-700 hover:bg-white rounded-xl shadow-sm transition-all border border-transparent hover:border-emerald-100 active:scale-95"
                                            >
                                                <ExternalLink size={16} />
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setSelectedQuote(quote);
                                                    setCustomerName(quote.customerName);
                                                    setTitle(quote.title);
                                                    setDescription(quote.description);
                                                    setItems(quote.items);
                                                    setValidUntil(quote.validUntil || '');
                                                    setLinkedOrderId(quote.linkedOrderId || '');
                                                    setIsModalOpen(true);
                                                }}
                                                className="p-3 bg-primary-50/50 text-primary-400 hover:text-primary-600 hover:bg-white rounded-xl shadow-sm transition-all border border-transparent hover:border-primary-100 active:scale-95"
                                            >
                                                <Edit3 size={16} />
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setViewQuote(quote);
                                                    setTimeout(() => window.print(), 100);
                                                }}
                                                className="p-3 bg-slate-900/5 text-slate-600 hover:text-slate-900 hover:bg-white rounded-xl shadow-sm transition-all border border-transparent hover:border-slate-200 active:scale-95"
                                                title="Imprimir Orçamento"
                                            >
                                                <Printer size={16} />
                                            </button>
                                            <button
                                                onClick={() => onDeleteQuote(quote.id)}
                                                className="p-3 bg-rose-50/50 text-rose-400 hover:text-rose-600 hover:bg-white rounded-xl shadow-sm transition-all border border-transparent hover:border-rose-100 active:scale-95"
                                            >
                                                <Trash2 size={16} />
                                            </button>
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
                    totalItems={totalQuotes}
                    itemsPerPage={PAGE_SIZE}
                    onPageChange={setCurrentPage}
                />
            </div>

            {/* Modal Editor de Orçamento */}
            {isModalOpen && (
                <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 sm:p-8 overflow-hidden">
                    <div className="bg-white rounded-xl w-full max-w-[96vw] h-[92vh] shadow-2xl border border-slate-200 overflow-hidden flex flex-col animate-scale-up">
                        <div className="px-8 py-5 border-b border-slate-200 flex justify-between items-center bg-white">
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 bg-slate-50 rounded-lg flex items-center justify-center text-[#1c2d4f] border border-slate-200">
                                    <Calculator size={18} />
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold text-slate-900 tracking-tight">
                                        {selectedQuote ? 'Ajustar Proposta Comercial' : 'Nova Proposta Comercial'}
                                    </h2>
                                    <p className="text-[10px] font-bold text-slate-400 mt-0.5 uppercase">NEXUS VENDAS • GESTÃO DE PROPOSTAS</p>
                                </div>
                            </div>
                            <button onClick={() => setIsModalOpen(false)} className="p-2 text-slate-400 hover:text-rose-600 transition-all rounded-lg hover:bg-rose-50">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden bg-slate-50/30">
                            <div className="w-full lg:w-[38%] border-b lg:border-b-0 lg:border-r border-slate-200 p-8 space-y-8 overflow-y-auto custom-scrollbar">
                                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
                                    <h3 className="text-sm font-bold text-slate-900 border-l-4 border-[#1c2d4f] pl-3 uppercase">dados básicos</h3>
                                    <div className="space-y-4">
                                        <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                                            <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Identificador da Proposta</label>
                                            <p className="text-lg font-bold text-[#1c2d4f] tracking-tight">{previewId}</p>
                                        </div>
                                        <div className="space-y-2 relative">
                                            <label className="text-[10px] font-bold text-slate-400 ml-1 uppercase">selecionar cliente</label>
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
                                                    className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-10 py-3 text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-[#1c2d4f10] focus:border-[#1c2d4f] transition-all"
                                                />
                                                {customerName && !isClientListOpen && (
                                                  <button onClick={() => {setCustomerName(''); setClientSearch('');}} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-rose-500">
                                                    <X size={14} />
                                                  </button>
                                                )}
                                            </div>
                                            {isClientListOpen && (
                                                <div className="absolute z-[1300] top-full mt-2 w-full bg-white border border-slate-200 rounded-xl shadow-2xl max-h-48 overflow-y-auto custom-scrollbar animate-scale-up">
                                                    {filteredClients.length > 0 ? (
                                                        filteredClients.map(c => (
                                                            <button
                                                                key={c.id}
                                                                onClick={() => {
                                                                    setCustomerName(c.name);
                                                                    setClientSearch(c.name);
                                                                    setIsClientListOpen(false);
                                                                }}
                                                                className="w-full text-left px-5 py-3 hover:bg-slate-50 border-b border-slate-100 last:border-0 transition-colors group"
                                                            >
                                                                <p className="text-xs font-bold text-slate-800 group-hover:text-[#1c2d4f]">{c.name}</p>
                                                                <p className="text-[10px] text-slate-400 font-medium">{c.document || c.cnpj || c.cpf || 'Sem documento'}</p>
                                                            </button>
                                                        ))
                                                    ) : (
                                                        <div className="p-6 text-center text-xs font-medium text-slate-400">Nenhum cliente localizado</div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-bold text-slate-400 ml-1 uppercase">título da proposta</label>
                                            <input
                                                type="text"
                                                value={title}
                                                onChange={(e) => setTitle(e.target.value)}
                                                placeholder="Ex: Manutenção Preventiva de Geradores..."
                                                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-[#1c2d4f10] focus:border-[#1c2d4f] transition-all"
                                            />
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-bold text-slate-400 ml-1 uppercase">validade</label>
                                                <div className="relative">
                                                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                                                    <input
                                                        type="date"
                                                        value={validUntil}
                                                        onChange={(e) => setValidUntil(e.target.value)}
                                                        className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-3 py-3 text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-[#1c2d4f10] focus:border-[#1c2d4f] transition-all"
                                                    />
                                                </div>
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-bold text-slate-400 ml-1 uppercase">vincular O.S.</label>
                                                <div className="relative">
                                                    <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                                                    <select
                                                        value={linkedOrderId}
                                                        onChange={(e) => setLinkedOrderId(e.target.value)}
                                                        className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-3 py-3 text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-[#1c2d4f10] focus:border-[#1c2d4f] transition-all appearance-none cursor-pointer"
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
                                </div>
                                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                                    <h3 className="text-sm font-bold text-slate-900 border-l-4 border-amber-500 pl-3 uppercase">detalhamento</h3>
                                    <div className="space-y-4">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-bold text-slate-400 ml-1 uppercase">escopo técnico</label>
                                            <textarea
                                                value={description}
                                                onChange={(e) => setDescription(e.target.value)}
                                                rows={3}
                                                placeholder="Descreva detalhadamente o serviço..."
                                                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-[#1c2d4f10] focus:border-[#1c2d4f] transition-all resize-none custom-scrollbar"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="w-full lg:w-[62%] flex flex-col bg-white">
                                <div className="px-8 py-5 border-b border-slate-200 flex items-center justify-between bg-white z-10">
                                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                                        <ListPlus size={16} className="text-emerald-500" /> Itens e Composição
                                    </h3>
                                    <button onClick={handleAddItem} className="flex items-center gap-2 px-4 py-2 bg-[#1c2d4f] text-white rounded-xl text-xs font-bold hover:bg-[#253a66] transition-all shadow-md active:scale-95">
                                        <Plus size={16} /> Adicionar Item
                                    </button>
                                </div>
                                <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-visible">
                                        <table className="w-full text-left table-fixed lg:table-auto overflow-visible">
                                            <thead className="bg-slate-50 border-b border-slate-200">
                                                <tr className="text-[10px] font-bold text-slate-400 uppercase">
                                                    <th className="px-6 py-3">Descrição / Item</th>
                                                    <th className="px-4 py-3 w-24 text-center">Qtd</th>
                                                    <th className="px-4 py-3 w-32">Unitário</th>
                                                    <th className="px-4 py-3 w-32 text-right">Subtotal</th>
                                                    <th className="px-6 py-3 w-16"></th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100 overflow-visible">
                                                {items.map((item, index) => (
                                                    <tr key={item.id} className={`hover:bg-slate-50/50 group transition-all ${isStockListOpen[index] ? 'z-[1400] relative bg-slate-50/80 shadow-sm' : 'z-auto'}`}>
                                                        <td className="px-6 py-4">
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
                                                                            className="w-full text-left px-5 py-3 hover:bg-slate-50 border-b border-slate-100 bg-primary-50/50 text-[#1c2d4f] font-bold text-[11px] uppercase transition-colors flex items-center justify-between"
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
                                                                                        updateItem(index, { description: s.description, unitPrice: s.sellPrice });
                                                                                        setIsStockListOpen(prev => ({ ...prev, [index]: false }));
                                                                                    }}
                                                                                    className="w-full text-left px-5 py-4 hover:bg-slate-50 border-b border-slate-50 last:border-0 transition-colors group/item"
                                                                                >
                                                                                    <div className="flex justify-between items-start">
                                                                                        <div>
                                                                                            <p className="text-xs font-bold text-slate-800 group-hover/item:text-[#1c2d4f]">{s.description}</p>
                                                                                            <p className="text-[10px] text-slate-400 font-medium mt-0.5">SKU: {s.code}</p>
                                                                                        </div>
                                                                                        <p className="text-xs font-bold text-emerald-600">R$ {s.sellPrice?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                                                                    </div>
                                                                                </button>
                                                                            ))
                                                                        }
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-4"><input type="number" value={item.quantity} onChange={e => updateItem(index, { quantity: Number(e.target.value) })} className="w-full bg-slate-50 border border-slate-200 rounded-lg text-center text-xs font-bold py-1.5" /></td>
                                                        <td className="px-4 py-4"><input type="number" value={item.unitPrice} onChange={e => updateItem(index, { unitPrice: Number(e.target.value) })} className="w-full bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold py-1.5 px-2" /></td>
                                                        <td className="px-4 py-4 text-right text-sm font-bold text-[#1c2d4f]">R$ {item.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                                        <td className="px-6 py-4"><button onClick={() => setItems(items.filter((_, i) => i !== index))} className="text-slate-300 hover:text-rose-600 transition-colors"><Trash2 size={16} /></button></td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                        {items.length === 0 && (
                                            <div className="py-20 text-center flex flex-col items-center gap-4">
                                                <ShoppingCart size={48} className="text-slate-200" />
                                                <p className="text-sm font-bold text-slate-400">Nenhum item na proposta</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="px-8 py-6 border-t border-slate-200 bg-white flex justify-between items-center bg-slate-50/50">
                            <div className="flex items-center gap-4">
                                <p className="text-[10px] font-bold text-slate-400 uppercase">Total Estimado</p>
                                <p className="text-2xl font-bold text-[#1c2d4f]">R$ {totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                            </div>
                            <div className="flex gap-4">
                                <button onClick={() => setIsModalOpen(false)} className="px-8 py-3 text-sm font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition-all">Cancelar</button>
                                <button
                                    onClick={handleSaveQuote}
                                    disabled={!customerName || !title || items.length === 0 || loading}
                                    className="px-12 py-3 bg-[#1c2d4f] text-white rounded-xl text-sm font-bold shadow-lg hover:bg-[#253a66] disabled:opacity-50 transition-all active:scale-95 flex items-center gap-2"
                                >
                                    {loading ? <Loader2 size={18} className="animate-spin" /> : 'Confirmar e Salvar'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL DE VISUALIZAÇÃO */}
            {isViewModalOpen && viewQuote && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[2000] flex items-center justify-center p-4 sm:p-8" onClick={() => setIsViewModalOpen(false)}>
                    <div className="bg-white rounded-xl w-full max-w-6xl h-[92vh] shadow-2xl flex flex-col overflow-hidden border border-slate-200 relative animate-scale-up" onClick={e => e.stopPropagation()}>
                        <div className="px-10 py-6 border-b border-slate-200 flex justify-between items-center bg-white shrink-0">
                            <div className="flex items-center gap-5">
                                <div className="w-12 h-12 bg-slate-50 text-[#1c2d4f] rounded-xl flex items-center justify-center border border-slate-100">
                                    <FileText size={22} />
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
                                        Proposta: {viewQuote.displayId || viewQuote.id}
                                        <div className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                            viewQuote.status === 'APROVADO' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' :
                                            viewQuote.status === 'REJEITADO' ? 'bg-rose-50 text-rose-600 border border-rose-100' :
                                            'bg-slate-100 text-slate-500 border border-slate-200'
                                        }`}>
                                            {viewQuote.status}
                                        </div>
                                    </h2>
                                    <p className="text-xs text-slate-400 font-medium mt-1 uppercase">Criado em {new Date(viewQuote.createdAt).toLocaleString('pt-BR')}</p>
                                </div>
                            </div>
                            <button onClick={() => setIsViewModalOpen(false)} className="p-2 text-slate-400 hover:text-rose-600 transition-all rounded-lg hover:bg-rose-50">
                                <X size={24} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-10 custom-scrollbar space-y-10 bg-slate-50/20">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                                <div className="space-y-4">
                                    <h3 className="text-xs font-bold text-slate-900 border-l-4 border-primary-500 pl-3 uppercase">Cliente</h3>
                                    <div className="bg-white p-6 rounded-2xl border border-slate-200">
                                        <p className="text-lg font-bold text-slate-900">{viewQuote.customerName}</p>
                                        <div className="flex items-center gap-2 mt-2 text-slate-500">
                                            <MapPin size={14} />
                                            <p className="text-xs font-medium">{viewQuote.customerAddress || 'N/D'}</p>
                                        </div>
                                    </div>
                                </div>
                                <div className="space-y-4">
                                    <h3 className="text-xs font-bold text-slate-900 border-l-4 border-amber-500 pl-3 uppercase">Objeto</h3>
                                    <div className="bg-white p-6 rounded-2xl border border-slate-200">
                                        <p className="text-sm font-bold text-slate-800">{viewQuote.title}</p>
                                        <p className="text-xs text-slate-500 mt-4 leading-relaxed">{viewQuote.description || 'Sem detalhamento.'}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <h3 className="text-xs font-bold text-slate-900 border-l-4 border-emerald-500 pl-3 uppercase">Itens da Proposta</h3>
                                <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                                    <table className="w-full text-left">
                                        <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-400 uppercase">
                                            <tr>
                                                <th className="px-8 py-3">Item</th>
                                                <th className="px-8 py-3">Descrição</th>
                                                <th className="px-8 py-3 text-center">Qtd</th>
                                                <th className="px-8 py-3">Unitário</th>
                                                <th className="px-8 py-3 text-right">Subtotal</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {viewQuote.items.map((item, idx) => (
                                                <tr key={idx}>
                                                    <td className="px-8 py-4 text-xs font-bold text-slate-300">{idx + 1}</td>
                                                    <td className="px-8 py-4 text-sm font-bold text-slate-700">{item.description}</td>
                                                    <td className="px-8 py-4 text-xs font-bold text-slate-500 text-center">{item.quantity}</td>
                                                    <td className="px-8 py-4 text-xs font-bold text-slate-500">R$ {item.unitPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                                    <td className="px-8 py-4 text-right text-sm font-bold text-[#1c2d4f]">R$ {item.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot className="bg-[#1c2d4f] text-white">
                                            <tr>
                                                <td colSpan={4} className="px-8 py-4 text-xs font-bold uppercase text-right">Total:</td>
                                                <td className="px-8 py-4 text-right text-xl font-bold">R$ {viewQuote.totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            </div>

                            {viewQuote.status === 'APROVADO' && (
                                <div className="bg-emerald-50 border border-emerald-100 p-8 rounded-2xl space-y-6">
                                    <div className="flex items-center gap-3">
                                        <ShieldCheck className="text-emerald-500" size={24} />
                                        <h4 className="text-sm font-bold text-emerald-900 uppercase">Aprovação Confirmada</h4>
                                    </div>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                                        <div><p className="text-[10px] font-bold text-emerald-600/60 uppercase">Aprovado por</p><p className="text-xs font-bold text-slate-700">{viewQuote.approvedByName}</p></div>
                                        <div><p className="text-[10px] font-bold text-emerald-600/60 uppercase">Vencimento</p><p className="text-xs font-bold text-slate-700">{viewQuote.validUntil ? new Date(viewQuote.validUntil).toLocaleDateString('pt-BR') : 'N/D'}</p></div>
                                        {viewQuote.approvalLatitude && (
                                            <div className="col-span-2">
                                                <p className="text-[10px] font-bold text-emerald-600/60 uppercase">Geo-Registro</p>
                                                <a href={`https://www.google.com/maps?q=${viewQuote.approvalLatitude},${viewQuote.approvalLongitude}`} target="_blank" className="text-xs font-bold text-primary-600 hover:underline">Ver no Mapa</a>
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex flex-col md:flex-row gap-6">
                                        <div className="flex-1 bg-white p-4 rounded-xl border border-emerald-100 flex flex-col items-center">
                                            <p className="text-[8px] font-bold text-slate-400 uppercase mb-2">Assinatura Capturada</p>
                                            {viewQuote.approvalSignature ? <img src={viewQuote.approvalSignature} alt="Assinatura" className="h-16 grayscale" /> : <p className="text-[10px] text-slate-300 italic">Indisponível</p>}
                                        </div>
                                        {viewQuote.approvalMetadata && (
                                            <div className="w-full md:w-64 bg-[#1c2d4f] p-4 rounded-xl text-white space-y-2">
                                                <div className="flex items-center gap-2 mb-2"><Cpu size={14} className="text-primary-400" /><p className="text-[9px] font-bold uppercase">Metadata</p></div>
                                                <div className="text-[9px] font-medium opacity-70">Plataforma: {viewQuote.approvalMetadata.platform}</div>
                                                <div className="text-[9px] font-medium opacity-70 truncate">Browser: {viewQuote.approvalMetadata.userAgent?.split(' ')[0]}</div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                         <div className="px-10 py-6 bg-white border-t border-slate-200 flex justify-end gap-3 shrink-0 print:hidden">
                            <button
                                onClick={() => window.print()}
                                className="px-8 py-3.5 bg-[#1c2d4f] text-white hover:bg-[#253a66] rounded-xl text-sm font-bold transition-all active:scale-95 flex items-center gap-2"
                            >
                                <Printer size={18} /> Imprimir Proposta
                            </button>
                            <button
                                onClick={() => setIsViewModalOpen(false)}
                                className="px-10 py-3.5 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-xl text-sm font-bold transition-all"
                            >
                                Fechar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style dangerouslySetInnerHTML={{ __html: `
                @media print {
                    body * { visibility: hidden; }
                    .fixed.inset-0.z-\\[2000\\], .fixed.inset-0.z-\\[2000\\] * { visibility: visible; }
                    .fixed.inset-0.z-\\[2000\\] { position: absolute; left: 0; top: 0; width: 100%; height: auto; overflow: visible !important; }
                    .print\\:hidden { display: none !important; }
                    .custom-scrollbar { overflow: visible !important; }
                    .bg-white { border: none !important; box-shadow: none !important; }
                    .bg-slate-50\\/20 { background-color: transparent !important; }
                    table { page-break-inside: auto; }
                    tr { page-break-inside: avoid; page-break-after: auto; }
                    thead { display: table-header-group; }
                    tfoot { display: table-footer-group; }
                }
            `}} />
        </div>
    );
};
