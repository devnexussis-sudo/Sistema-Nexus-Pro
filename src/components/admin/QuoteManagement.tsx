
import React, { useState, useMemo } from 'react';
import {
    Search, Plus, FileText, DollarSign, Clock, CheckCircle,
    XCircle, MoreHorizontal, ArrowRight, Trash2, Edit3, Trash, Edit,
    ChevronRight, CreditCard, User, MapPin, Briefcase,
    ArrowUpRight, Loader2, ListPlus, Calculator, Inbox, Calendar, Link2, Share2,
    Eye, Link, ExternalLink, Globe, ClipboardCheck, ShieldCheck, Box, Signature as SignatureIcon,
    AlertCircle, ChevronLeft
} from 'lucide-react';
import { Pagination } from '../ui/Pagination';
import { Customer, OrderStatus, OrderPriority, ServiceOrder, StockItem, Quote, QuoteItem } from '../../types';

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
    const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);
    const [viewQuote, setViewQuote] = useState<Quote | null>(null);

    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 12;

    // Form States
    const [customerName, setCustomerName] = useState('');
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [items, setItems] = useState<QuoteItem[]>([]);
    const [notes, setNotes] = useState('');
    const [validUntil, setValidUntil] = useState('');
    const [linkedOrderId, setLinkedOrderId] = useState('');

    const totalValue = useMemo(() => items.reduce((acc, curr) => acc + curr.total, 0), [items]);

    // 🚀 Preview de ID Soberano Nexus em Tempo Real (Padrão Sequencial)
    const previewId = useMemo(() => {
        if (selectedQuote) return selectedQuote.id;
        if (!customerName) return 'ORC-XXXXXX000';

        const customer = customers.find(c => c.name === customerName);
        const docClean = (customer?.document || '0000').replace(/\D/g, '');
        const docPart = docClean.substring(0, 2).padStart(2, '0');

        const now = new Date();
        const yy = String(now.getFullYear()).substring(2);
        const mm = String(now.getMonth() + 1).padStart(2, '0');

        // Calcula o sequenciador local para o preview
        const currentMonthQuotes = quotes.filter(q => {
            const date = new Date(q.createdAt);
            return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
        });

        const sequencer = String(currentMonthQuotes.length + 1).padStart(3, '0');

        return `ORC-${docPart}${yy}${mm}${sequencer}`;
    }, [customerName, customers, selectedQuote, quotes]);

    // Filtra as ordens do cliente selecionado para permitir vínculo manual
    // Usa comparação case-insensitive e trim para evitar mismatches de capitalização
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

        // Se a descrição mudou, verifica se bate com algo no estoque para sugerir preço
        if (fields.description) {
            const matchedStock = stockItems.find(s => s.description.toLowerCase() === fields.description?.toLowerCase());
            if (matchedStock) {
                fields.unitPrice = matchedStock.sellPrice;
            }
        }

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

            console.log('[QuoteManagement] Salvando orçamento...', payload);

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

    const filteredQuotes = useMemo(() => {
        const term = searchTerm.toLowerCase();
        return quotes.filter(q =>
            q.customerName.toLowerCase().includes(term) ||
            q.id.toLowerCase().includes(term) ||
            (q.linkedOrderId || '').toLowerCase().includes(term)
        );
    }, [quotes, searchTerm]);

    useMemo(() => {
        setCurrentPage(1);
    }, [searchTerm]);

    const paginatedQuotes = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        return filteredQuotes.slice(start, start + ITEMS_PER_PAGE);
    }, [filteredQuotes, currentPage]);

    const totalPages = Math.ceil(filteredQuotes.length / ITEMS_PER_PAGE);

    return (
        <div className="p-4 animate-fade-in flex flex-col h-full bg-slate-50/20 overflow-hidden">
            {/* Toolbar (Moved Outside) */}
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
                <button
                    onClick={() => { resetForm(); setIsModalOpen(true); }}
                    className="px-6 py-3 h-[46px] bg-[#1c2d4f] text-white rounded-xl text-[10px] font-bold uppercase shadow-sm shadow-[#1c2d4f]/10 hover:bg-[#253a66] transition-all flex items-center gap-2 whitespace-nowrap"
                >
                    <Plus size={16} /> Novo Orçamento
                </button>
            </div>

            <div className="bg-white border border-slate-100 rounded-[2rem] overflow-hidden shadow-2xl shadow-slate-200/40 flex-1 flex flex-col min-h-0">
                <div className="flex-1 overflow-auto custom-scrollbar">
                    <table className="w-full border-separate border-spacing-y-0 text-left">
                        <thead className="sticky top-0 bg-white/80 backdrop-blur-md z-10 text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">
                            <tr className="border-b border-slate-100">
                                <th className="px-4 py-2">Orçamento ID</th>
                                <th className="px-4 py-2">Criado em</th>
                                <th className="px-4 py-2">Cliente</th>
                                <th className="px-4 py-2">Validade</th>
                                <th className="px-4 py-2">Valor Total</th>
                                <th className="px-4 py-2">Vínculo O.S.</th>
                                <th className="px-4 py-2 text-center">Status</th>
                                <th className="px-4 py-2 text-right pr-6">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {paginatedQuotes.map(quote => (
                                <tr key={quote.id} className="bg-white hover:bg-primary-50/40 border-b border-slate-50 transition-all group last:border-0 shadow-sm hover:shadow-md">
                                    <td className="px-4 py-1.5">
                                        <div className="flex flex-col truncate max-w-[140px]">
                                            {/* quote.id É o Identificador Soberano (ORC-...) gerado no createQuote */}
                                            <span className="text-[11px] font-black uppercase italic text-primary-600 tracking-tighter truncate" title={quote.id}>{quote.id}</span>
                                            <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest truncate">{quote.title}</span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-1.5">
                                        <div className="flex items-center gap-1.5 whitespace-nowrap">
                                            <Clock size={10} className="text-slate-400" />
                                            <span className="text-[10px] font-bold text-slate-600 uppercase">{new Date(quote.createdAt).toLocaleDateString()}</span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-1.5 text-[10px] font-black uppercase italic text-slate-700 truncate max-w-[150px]">{quote.customerName}</td>
                                    <td className="px-4 py-1.5">
                                        <div className="flex items-center gap-1.5 whitespace-nowrap">
                                            <Calendar size={10} className="text-slate-400" />
                                            <span className="text-[10px] font-bold text-slate-600 uppercase">{quote.validUntil ? new Date(quote.validUntil).toLocaleDateString() : 'N/D'}</span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-1.5 text-[11px] font-bold text-emerald-600 whitespace-nowrap">R$ {quote.totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                    <td className="px-4 py-1.5 text-[9px] font-bold uppercase whitespace-nowrap">
                                        {quote.linkedOrderId ? (() => {
                                            // Busca a OS vinculada para exibir o protocolo (displayId) em vez do UUID
                                            const linkedOrder = orders.find(o =>
                                                o.id === quote.linkedOrderId ||
                                                o.displayId === quote.linkedOrderId
                                            );
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
                                        <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[8px] font-black uppercase ${quote.status === 'ABERTO' ? 'bg-primary-50 text-primary-600 border border-primary-100' :
                                            quote.status === 'APROVADO' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' :
                                                quote.status === 'CONVERTIDO' ? 'bg-slate-900 text-emerald-400 border border-slate-700' :
                                                    'bg-rose-50 text-rose-500 border border-rose-100'
                                            }`}>
                                            <span className={`w-1 h-1 rounded-full animate-pulse ${quote.status === 'ABERTO' ? 'bg-primary-600' : quote.status === 'APROVADO' ? 'bg-emerald-600' : quote.status === 'CONVERTIDO' ? 'bg-emerald-400' : 'bg-rose-500'}`} />
                                            {quote.status}
                                        </div>
                                    </td>
                                    <td className="px-6 py-2 text-right pr-6">
                                        <div className="flex justify-end gap-1.5 transition-all">
                                            {/* Visualizar Tudo */}
                                            <button
                                                onClick={() => {
                                                    setViewQuote(quote);
                                                    setIsViewModalOpen(true);
                                                }}
                                                className="p-3 bg-slate-50/50 text-slate-400 hover:text-slate-900 hover:bg-white rounded-xl shadow-sm transition-all border border-transparent hover:border-slate-100 active:scale-95"
                                                title="Visualizar Completo"
                                            >
                                                <Eye size={16} />
                                            </button>

                                            {/* Copiar URL */}
                                            <button
                                                onClick={() => {
                                                    const url = `${window.location.origin}/#/view-quote/${quote.publicToken || quote.id}`;
                                                    console.log('[QuoteManagement] Copiando link público:', url);
                                                    navigator.clipboard.writeText(url);
                                                    alert('URL pública copiada para a área de transferência!');
                                                }}
                                                className="p-3 bg-primary-50/50 text-primary-400 hover:text-primary-600 hover:bg-white rounded-xl shadow-sm transition-all border border-transparent hover:border-primary-100 active:scale-95"
                                                title="Copiar URL Pública"
                                            >
                                                <Link size={16} />
                                            </button>

                                            {/* Abrir em Nova Aba */}
                                            <button
                                                onClick={() => {
                                                    const url = `${window.location.origin}/#/view-quote/${quote.publicToken || quote.id}`;
                                                    console.log('[QuoteManagement] Abrindo link público:', url);
                                                    window.open(url, '_blank');
                                                }}
                                                className="p-3 bg-emerald-50/50 text-emerald-500 hover:text-emerald-700 hover:bg-white rounded-xl shadow-sm transition-all border border-transparent hover:border-emerald-100 active:scale-95"
                                                title="Abrir Link Público"
                                            >
                                                <ExternalLink size={16} />
                                            </button>

                                            {quote.status !== 'CONVERTIDO' && (
                                                <button
                                                    onClick={() => handleConvertToOrder(quote)}
                                                    className="p-3 bg-amber-50/50 text-amber-500 hover:text-amber-700 hover:bg-white rounded-xl shadow-sm transition-all border border-transparent hover:border-amber-100 active:scale-95"
                                                    title="Converter em O.S."
                                                >
                                                    <ArrowUpRight size={16} />
                                                </button>
                                            )}

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
                                                title="Editar"
                                            >
                                                <Edit3 size={16} />
                                            </button>

                                            <button
                                                onClick={() => onDeleteQuote(quote.id)}
                                                className="p-3 bg-rose-50/50 text-rose-400 hover:text-rose-600 hover:bg-white rounded-xl shadow-sm transition-all border border-transparent hover:border-rose-100 active:scale-95"
                                                title="Excluir"
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
                    totalItems={filteredQuotes.length}
                    itemsPerPage={ITEMS_PER_PAGE}
                    onPageChange={setCurrentPage}
                />
            </div>

            {/* Modal Editor de Orçamento - BIG TECH STANDARD DESIGN */}
            {isModalOpen && (
                <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-hidden">
                    <div className="bg-white rounded-[2.5rem] w-full max-w-7xl h-[90vh] shadow-2xl overflow-hidden animate-fade-in-up flex flex-col border border-white/20">
                        {/* Header Compacto */}
                        <div className="px-8 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/30">
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 bg-[#1c2d4f] rounded-xl flex items-center justify-center text-white shadow-lg">
                                    <Calculator size={20} />
                                </div>
                                <div>
                                    <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight leading-none">{selectedQuote ? 'Ajustar Proposta' : 'Nova Proposta Comercial'}</h2>
                                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-[0.2em] mt-1">Engenharia de Vendas Nexus Pro</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                            >
                                <XCircle size={24} className="text-slate-300 hover:text-rose-500" />
                            </button>
                        </div>

                        {/* Corpo do Modal - Grid Layout p/ Visibilidade Total */}
                        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
                            {/* Coluna Esquerda: Dados Principais (35% -> 100% on mobile) */}
                            <div className="w-full lg:w-[35%] border-b lg:border-b-0 lg:border-r border-slate-100 p-6 lg:p-8 space-y-6 overflow-y-auto custom-scrollbar bg-slate-50/20">
                                <div className="p-4 lg:p-5 bg-white border border-slate-200 rounded-2xl shadow-sm">
                                    <label className="text-[8px] font-black text-slate-400 uppercase mb-1 block tracking-widest">Identificador Soberano</label>
                                    <p className="text-xl font-black text-[#1c2d4f] uppercase tracking-tighter">{previewId}</p>
                                </div>

                                <div className="space-y-4">
                                    <div>
                                        <label className="text-[9px] font-black text-slate-400 uppercase mb-2 block tracking-widest">Cliente</label>
                                        <select
                                            value={customerName}
                                            onChange={(e) => setCustomerName(e.target.value)}
                                            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold uppercase outline-none focus:ring-4 focus:ring-primary-100 transition-all"
                                        >
                                            <option value="">Selecionar Cliente...</option>
                                            {customers.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                                        </select>
                                    </div>

                                    <div>
                                        <label className="text-[9px] font-black text-slate-400 uppercase mb-2 block tracking-widest">Título da Proposta</label>
                                        <input
                                            type="text"
                                            value={title}
                                            onChange={(e) => setTitle(e.target.value)}
                                            placeholder="Ex: Manutenção Preventiva Q1..."
                                            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold uppercase outline-none focus:ring-4 focus:ring-primary-100 transition-all"
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-[9px] font-black text-slate-400 uppercase mb-2 block tracking-widest">Validade</label>
                                            <div className="relative">
                                                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-primary-400" size={14} />
                                                <input
                                                    type="date"
                                                    value={validUntil}
                                                    onChange={(e) => setValidUntil(e.target.value)}
                                                    className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-3 py-3 text-xs font-bold uppercase outline-none focus:ring-4 focus:ring-primary-100 transition-all"
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="text-[9px] font-black text-slate-400 uppercase mb-2 block tracking-widest">Protocolo O.S.</label>
                                            <div className="relative">
                                                <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 text-primary-400" size={14} />
                                                <select
                                                    value={linkedOrderId}
                                                    onChange={(e) => setLinkedOrderId(e.target.value)}
                                                    className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-3 py-3 text-xs font-bold uppercase outline-none focus:ring-4 focus:ring-primary-100 transition-all"
                                                >
                                                    <option value="">Sem Vínculo</option>
                                                    {customerOrders.length === 0 && customerName && (
                                                        <option disabled value="">── Nenhuma OS para este cliente ──</option>
                                                    )}
                                                    {customerOrders.map(o => {
                                                        // Usa Identificador Soberano (displayId) como label e value
                                                        const label = o.displayId || o.id;
                                                        const value = o.displayId || o.id;
                                                        return (
                                                            <option key={o.id} value={value}>
                                                                {label} — {o.title}
                                                            </option>
                                                        );
                                                    })}
                                                </select>
                                            </div>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="text-[9px] font-black text-slate-400 uppercase mb-2 block tracking-widest">Escopo Técnico</label>
                                        <textarea
                                            value={description}
                                            onChange={(e) => setDescription(e.target.value)}
                                            rows={2}
                                            placeholder="Detalhamento técnico do serviço..."
                                            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold uppercase outline-none focus:ring-4 focus:ring-primary-100 transition-all resize-none shadow-inner"
                                        />
                                    </div>

                                    <div>
                                        <label className="text-[9px] font-black text-slate-400 uppercase mb-2 block tracking-widest">Observações Internas</label>
                                        <textarea
                                            value={notes}
                                            onChange={(e) => setNotes(e.target.value)}
                                            rows={2}
                                            placeholder="Notas privadas para o faturamento..."
                                            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold uppercase outline-none focus:ring-4 focus:ring-primary-100 transition-all resize-none shadow-inner"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Coluna Direita: Composição de Preços (65% -> 100% on mobile) */}
                            <div className="w-full lg:w-[65%] flex flex-col bg-white">
                                <div className="px-6 lg:px-8 py-4 border-b border-slate-50 flex items-center justify-between sticky top-0 bg-white z-10 shadow-sm">
                                    <div className="flex items-center gap-2">
                                        <ListPlus size={16} className="text-primary-600" />
                                        <label className="text-[10px] font-black text-slate-900 uppercase tracking-widest italic">Composição de Preços e Itens</label>
                                    </div>
                                    <button
                                        onClick={handleAddItem}
                                        className="px-4 py-2 bg-[#1c2d4f] text-white rounded-lg text-[10px] font-black uppercase shadow-lg shadow-[#1c2d4f]/20 hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
                                    >
                                        <Plus size={14} /> Adicionar Item
                                    </button>
                                </div>

                                <div className="flex-1 overflow-y-auto p-8 space-y-3 custom-scrollbar">
                                    {items.length > 0 ? (
                                        <>
                                            <div className="grid grid-cols-12 gap-4 px-4 py-1 mb-2">
                                                <div className="col-span-6 text-[8px] font-black text-slate-300 uppercase tracking-widest pl-1">Descrição / Produto / Serviço</div>
                                                <div className="col-span-2 text-[8px] font-black text-slate-300 uppercase tracking-widest">Qtd</div>
                                                <div className="col-span-2 text-[8px] font-black text-slate-300 uppercase tracking-widest">R$ Unit</div>
                                                <div className="col-span-2 text-[8px] font-black text-slate-300 uppercase tracking-widest text-right pr-12">Subtotal</div>
                                            </div>
                                            {items.map((item, index) => (
                                                <div key={item.id} className="grid grid-cols-12 gap-4 items-center p-3 bg-white rounded-xl border border-slate-100 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05)] hover:border-primary-300 transition-all group">
                                                    <div className="col-span-6">
                                                        <input
                                                            placeholder="Digitar item ou escolher do estoque..."
                                                            value={item.description}
                                                            list="stock-suggestions"
                                                            onChange={e => updateItem(index, { description: e.target.value })}
                                                            className="w-full bg-transparent border-none text-[10px] font-black uppercase outline-none text-slate-800 placeholder:text-slate-300"
                                                        />
                                                    </div>
                                                    <div className="col-span-2">
                                                        <input
                                                            type="number"
                                                            value={item.quantity}
                                                            onChange={e => updateItem(index, { quantity: Number(e.target.value) })}
                                                            className="w-full bg-slate-50 border border-slate-100 rounded-lg px-2 py-1.5 text-[10px] font-black outline-none focus:bg-white focus:border-primary-200"
                                                        />
                                                    </div>
                                                    <div className="col-span-2">
                                                        <input
                                                            type="number"
                                                            value={item.unitPrice}
                                                            onChange={e => updateItem(index, { unitPrice: Number(e.target.value) })}
                                                            className="w-full bg-slate-50 border border-slate-100 rounded-lg px-2 py-1.5 text-[10px] font-black outline-none focus:bg-white focus:border-primary-200"
                                                        />
                                                    </div>
                                                    <div className="col-span-2 flex items-center justify-between pl-4">
                                                        <p className="text-[11px] font-black text-[#1c2d4f] italic">R$ {item.total.toLocaleString('pt-BR')}</p>
                                                        <button
                                                            onClick={() => setItems(items.filter((_, i) => i !== index))}
                                                            className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </>
                                    ) : (
                                        <div className="h-full flex flex-col items-center justify-center text-slate-200 border-2 border-dashed border-slate-50 rounded-3xl">
                                            <Calculator size={48} className="mb-4 opacity-10" />
                                            <p className="text-[9px] font-black uppercase tracking-[0.3em] italic">Orçamento Vazio</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Footer Unificado e Sempre Visível */}
                        <div className="px-6 lg:px-8 py-4 lg:py-6 bg-[#1c2d4f] flex flex-col sm:flex-row justify-between items-center gap-4 lg:gap-10 shadow-[0_-10px_30px_rgba(0,0,0,0.15)] z-20 shrink-0">
                            <div className="flex flex-col sm:flex-row items-center gap-4 lg:gap-10 w-full sm:w-auto">
                                <div className="flex items-center gap-4 border-b sm:border-b-0 sm:border-r border-white/10 pb-4 sm:pb-0 sm:pr-10 w-full sm:w-auto">
                                    <div className="w-10 h-10 lg:w-12 lg:h-12 bg-emerald-500/20 rounded-2xl flex items-center justify-center text-emerald-400 border border-emerald-500/30 shrink-0">
                                        <DollarSign size={20} className="lg:hidden" />
                                        <DollarSign size={24} className="hidden lg:block" />
                                    </div>
                                    <div>
                                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Investimento Total</p>
                                        <p className="text-xl lg:text-3xl font-black text-white italic leading-none">R$ {totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                    </div>
                                </div>
                                <div className="hidden sm:flex items-center gap-3">
                                    <span className={`w-2 h-2 rounded-full ${(!customerName || !title || items.length === 0) ? 'bg-rose-500' : 'bg-emerald-500'} animate-pulse`}></span>
                                    <p className="text-[9px] font-black text-slate-300 uppercase tracking-[0.1em] italic">
                                        {!customerName ? 'Selecione o Cliente' : !title ? 'Informe o Título' : items.length === 0 ? 'Adicione Itens' : 'Pronto para faturar'}
                                    </p>
                                </div>
                            </div>

                            <div className="flex gap-3 lg:gap-4 w-full sm:w-auto">
                                <button
                                    onClick={() => setIsModalOpen(false)}
                                    className="flex-1 sm:flex-none px-4 lg:px-6 py-3 lg:py-4 text-[10px] font-black uppercase text-slate-400 hover:text-white tracking-widest transition-colors"
                                    disabled={loading}
                                >
                                    Sair
                                </button>
                                <button
                                    onClick={handleSaveQuote}
                                    disabled={!customerName || !title || items.length === 0 || loading}
                                    className="flex-[2] sm:flex-none px-6 lg:px-12 py-3 lg:py-4 bg-emerald-500 text-white rounded-2xl text-[10px] font-black uppercase italic shadow-2xl shadow-emerald-500/20 disabled:opacity-30 transition-all hover:bg-emerald-400 hover:scale-[1.05] active:scale-95 flex items-center justify-center gap-2 lg:gap-3"
                                >
                                    {loading ? (
                                        <>
                                            <Loader2 size={16} className="animate-spin" />
                                            <span className="hidden sm:inline">Salvando...</span>
                                        </>
                                    ) : (
                                        <>
                                            Gerar Orçamento <ArrowRight size={16} />
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL DE VISUALIZAÇÃO COMPLETA (VIEW MODAL) */}
            {isViewModalOpen && viewQuote && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[2000] flex items-center justify-center p-6 animate-fade-in">
                    <div className="bg-white w-full max-w-5xl max-h-[90vh] rounded-[3.5rem] shadow-[0_32px_64px_-15px_rgba(0,0,0,0.3)] flex flex-col overflow-hidden border border-white">

                        {/* Header do View Modal */}
                        <div className="px-10 py-8 bg-slate-900 flex justify-between items-center shrink-0">
                            <div className="flex items-center gap-6">
                                <div className="p-4 bg-white/10 rounded-2xl backdrop-blur-md"><FileText size={24} className="text-white" /></div>
                                <div>
                                    <p className="text-[9px] font-black text-white/40 uppercase tracking-widest leading-none mb-2">Inspeção Sênior Nexus</p>
                                    <h2 className="text-2xl font-black text-white uppercase italic tracking-tighter leading-none">Orçamento Ref: {viewQuote.id}</h2>
                                </div>
                            </div>
                            <button onClick={() => setIsViewModalOpen(false)} className="p-4 bg-white/5 text-white/40 hover:text-white hover:bg-white/10 rounded-2xl transition-all">
                                <XCircle size={24} />
                            </button>
                        </div>

                        {/* Corpo do View Modal */}
                        <div className="flex-1 overflow-y-auto p-10 custom-scrollbar space-y-10">

                            {/* Linha 1: Status e Datas */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div className="p-6 bg-slate-50 rounded-[2rem] border border-slate-100">
                                    <p className="text-[8px] font-black text-slate-400 uppercase mb-2">Status Atual</p>
                                    <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-[10px] font-black uppercase ${viewQuote.status === 'APROVADO' ? 'bg-emerald-500 text-white' :
                                        viewQuote.status === 'REJEITADO' ? 'bg-rose-500 text-white' :
                                            'bg-slate-200 text-slate-600'
                                        }`}>
                                        <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                                        {viewQuote.status}
                                    </div>
                                </div>
                                <div className="p-6 bg-slate-50 rounded-[2rem] border border-slate-100">
                                    <p className="text-[8px] font-black text-slate-400 uppercase mb-2">Data de Criação</p>
                                    <p className="text-sm font-black text-slate-700 uppercase italic flex items-center gap-2"><Clock size={14} className="text-primary-500" /> {new Date(viewQuote.createdAt).toLocaleString()}</p>
                                </div>
                                <div className="p-6 bg-slate-50 rounded-[2rem] border border-slate-100">
                                    <p className="text-[8px] font-black text-slate-400 uppercase mb-2">Validade</p>
                                    <p className="text-sm font-black text-slate-700 uppercase italic flex items-center gap-2"><Calendar size={14} className="text-primary-500" /> {viewQuote.validUntil ? new Date(viewQuote.validUntil).toLocaleDateString() : 'N/D'}</p>
                                </div>
                            </div>

                            {/* Linha 2: Cliente e Escopo */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                                <div className="space-y-6">
                                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 border-b border-slate-100 pb-2"><User size={12} /> Dados do Cliente</h3>
                                    <div>
                                        <p className="text-xl font-black text-slate-900 uppercase italic tracking-tighter">{viewQuote.customerName}</p>
                                        <div className="flex items-center gap-2 mt-2 text-slate-500">
                                            <MapPin size={12} />
                                            <p className="text-[11px] font-bold uppercase">{viewQuote.customerAddress}</p>
                                        </div>
                                    </div>
                                </div>
                                <div className="space-y-6">
                                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 border-b border-slate-100 pb-2"><Briefcase size={12} /> Título e Objeto</h3>
                                    <div>
                                        <p className="text-[12px] font-black text-slate-800 uppercase italic">{viewQuote.title}</p>
                                        {viewQuote.description && <p className="text-[10px] text-slate-400 mt-2 leading-relaxed italic line-clamp-3">{viewQuote.description}</p>}
                                    </div>
                                </div>
                            </div>

                            {/* Linha 3: Tabela de Itens (Compacta) */}
                            <div className="space-y-4">
                                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 border-b border-slate-100 pb-2"><Calculator size={12} /> Composição de Preços</h3>
                                <div className="border border-slate-100 rounded-3xl overflow-hidden shadow-sm bg-slate-50/30">
                                    <table className="w-full text-left">
                                        <thead className="bg-white text-[8px] font-black text-slate-400 uppercase">
                                            <tr>
                                                <th className="px-6 py-1.5">Item</th>
                                                <th className="px-6 py-1.5">Descrição</th>
                                                <th className="px-6 py-1.5">Qtde</th>
                                                <th className="px-6 py-1.5">Unitário</th>
                                                <th className="px-6 py-1.5 text-right">Subtotal</th>
                                            </tr>
                                        </thead>
                                        <tbody className="text-[10px] font-bold">
                                            {viewQuote.items.map((item, idx) => (
                                                <tr key={idx} className="border-t border-slate-50 hover:bg-white transition-colors">
                                                    <td className="px-6 py-1.5 text-slate-400 font-mono">{(idx + 1).toString().padStart(2, '0')}</td>
                                                    <td className="px-6 py-1.5 text-slate-700 uppercase">{item.description}</td>
                                                    <td className="px-6 py-1.5 text-slate-500">{item.quantity} un</td>
                                                    <td className="px-6 py-1.5 text-slate-500">R$ {item.unitPrice.toLocaleString('pt-BR')}</td>
                                                    <td className="px-6 py-1.5 text-right text-slate-900 font-black italic">R$ {item.total.toLocaleString('pt-BR')}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot className="bg-slate-900 text-white">
                                            <tr>
                                                <td colSpan={4} className="px-6 py-1.5 text-[9px] font-black uppercase text-right">Investimento Total Aplicado:</td>
                                                <td className="px-6 py-1.5 text-right text-lg font-black italic tracking-tighter">R$ {viewQuote.totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            </div>

                            {/* Linha 4: Auditoria de Aprovação (Se aprovado) */}
                            {viewQuote.status === 'APROVADO' && (
                                <div className="mt-10 p-10 bg-primary-50/50 rounded-[3rem] border-2 border-dashed border-primary-200 space-y-8 animate-fade-in-up">
                                    <div className="flex items-center gap-4 border-b border-primary-100 pb-6">
                                        <div className="p-3 bg-primary-600 rounded-2xl shadow-lg shadow-primary-200"><ShieldCheck size={20} className="text-white" /></div>
                                        <div>
                                            <h4 className="text-[13px] font-black text-primary-900 uppercase italic">Registro de Auditoria Digital</h4>
                                            <p className="text-[10px] text-primary-400 font-black uppercase tracking-widest">Este documento possui validade comercial e assinatura capturada.</p>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                                        <div className="space-y-6">
                                            <div className="grid grid-cols-2 gap-6">
                                                <div>
                                                    <p className="text-[8px] font-black text-primary-400 uppercase mb-1">Aprovado Por</p>
                                                    <p className="text-xs font-black text-slate-700 uppercase italic leading-tight">{viewQuote.approvedByName}</p>
                                                </div>
                                                <div>
                                                    <p className="text-[8px] font-black text-primary-400 uppercase mb-1">Documento (CPF)</p>
                                                    <p className="text-xs font-black text-slate-700 italic">{viewQuote.approvalDocument}</p>
                                                </div>
                                                <div>
                                                    <p className="text-[8px] font-black text-primary-400 uppercase mb-1">Data da Assinatura</p>
                                                    <p className="text-xs font-black text-slate-700 italic">{viewQuote.approvedAt ? new Date(viewQuote.approvedAt).toLocaleString() : 'N/D'}</p>
                                                </div>
                                                <div>
                                                    <p className="text-[8px] font-black text-primary-400 uppercase mb-1">Nascimento Resp.</p>
                                                    <p className="text-xs font-black text-slate-700 italic">{viewQuote.approvalBirthDate ? new Date(viewQuote.approvalBirthDate).toLocaleDateString() : 'N/D'}</p>
                                                </div>
                                            </div>

                                            {/* Localização GPS */}
                                            {viewQuote.approvalLatitude && (
                                                <div className="p-6 bg-white rounded-3xl border border-primary-100 flex items-center gap-4">
                                                    <div className="w-10 h-10 bg-primary-50 text-primary-600 rounded-xl flex items-center justify-center"><Globe size={20} className="animate-pulse" /></div>
                                                    <div>
                                                        <p className="text-[8px] font-black text-primary-400 uppercase">Geolocalização de Aceite</p>
                                                        <p className="text-[10px] font-black text-slate-700 italic tracking-tighter">{viewQuote.approvalLatitude}, {viewQuote.approvalLongitude}</p>
                                                        <a
                                                            href={`https://www.google.com/maps?q=${viewQuote.approvalLatitude},${viewQuote.approvalLongitude}`}
                                                            target="_blank"
                                                            className="text-[8px] font-black text-primary-500 uppercase hover:underline mt-1 block"
                                                        >Ver no Satélite</a>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* Assinatura */}
                                        <div className="space-y-4">
                                            <div className="flex items-center gap-2">
                                                <SignatureIcon size={14} className="text-primary-400" />
                                                <p className="text-[8px] font-black text-primary-400 uppercase">Assinatura Digital Capturada</p>
                                            </div>
                                            <div className="bg-white p-8 rounded-[2.5rem] border border-primary-100 shadow-sm flex items-center justify-center overflow-hidden">
                                                {viewQuote.approvalSignature ? (
                                                    <img src={viewQuote.approvalSignature} alt="Assinatura" className="h-32 object-contain grayscale" />
                                                ) : (
                                                    <p className="text-[9px] font-black text-rose-300 uppercase italic">Assinatura não gravada</p>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Metadados Técnicos */}
                                    {viewQuote.approvalMetadata && (
                                        <div className="p-6 bg-slate-900 rounded-[2.5rem] opacity-90">
                                            <div className="flex items-center gap-2 mb-4">
                                                <Box size={14} className="text-primary-400" />
                                                <p className="text-[8px] font-black text-primary-400 uppercase tracking-widest">Caixa Preta: Impressão Digital do Dispositivo</p>
                                            </div>
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-[8px] font-bold uppercase text-slate-500">
                                                <div><p className="text-slate-600">Dispositivo/Plat</p><p className="text-primary-300 truncate">{viewQuote.approvalMetadata.platform}</p></div>
                                                <div><p className="text-slate-600">Resolução</p><p className="text-primary-300">{viewQuote.approvalMetadata.screenWidth}x{viewQuote.approvalMetadata.screenHeight}</p></div>
                                                <div><p className="text-slate-600">Timezone</p><p className="text-primary-300">{viewQuote.approvalMetadata.timezone}</p></div>
                                                <div><p className="text-slate-600">Navegador</p><p className="text-primary-300 truncate">{viewQuote.approvalMetadata.userAgent.split(' ')[0]}</p></div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Notas Finais */}
                            <div className="p-8 bg-slate-50 rounded-[2.5rem] border border-slate-100 flex items-start gap-4">
                                <AlertCircle size={20} className="text-slate-400 mt-1" />
                                <div>
                                    <h5 className="text-[10px] font-black text-slate-600 uppercase mb-2">Observações Técnicas / Internas</h5>
                                    <p className="text-[10px] text-slate-500 leading-relaxed italic">{viewQuote.notes || 'Nenhuma observação interna registrada para este orçamento.'}</p>
                                </div>
                            </div>
                        </div>

                        {/* Footer do View Modal */}
                        <div className="px-10 py-8 bg-slate-50 border-t border-slate-100 flex justify-end shrink-0">
                            <button
                                onClick={() => setIsViewModalOpen(false)}
                                className="px-12 py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase italic shadow-lg shadow-slate-900/20 hover:scale-[1.02] active:scale-95 transition-all"
                            >
                                Fechar Inspeção
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
