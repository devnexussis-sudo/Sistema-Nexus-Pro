import React, { useState, useMemo, useRef, useEffect } from 'react';
import { ServiceOrder, OrderStatus, User, Quote } from '../../types';
import type { DbTenant } from '../../types/database';
import {
    Search, X, DollarSign, Calendar, Users, Tag,
    CreditCard, ArrowRight, CheckCircle2, FileText, Printer, ShieldCheck, MapPin,
    Layout as Layer, Info, UserCheck, Wallet, Smartphone, Layers, Wrench, Check, ArrowUpRight,
    TrendingUp, Clock, FileSpreadsheet, ChevronRight, Plus, Slash, ArrowUp, ArrowDown, ArrowUpDown, Filter, Loader2, Share2
} from 'lucide-react';
import { Pagination } from '../ui/Pagination';
import { NexusBranding } from '../ui/NexusBranding';
import { DataService } from '../../services/dataService';
import XLSX from 'xlsx-js-style';
import { NexusQueryClient } from '../../hooks/nexusHooks';

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

    useEffect(() => {
        // Ao montar o dashboard financeiro, força uma invalidação dos orçamentos para exibir imediatamente os orçamentos aprovados no dia (cache refresh).
        NexusQueryClient.invalidateQuotes();
    }, []);

    const getDefaultDates = () => {
        const dEnd = new Date();
        const dStart = new Date();
        dStart.setMonth(dStart.getMonth() - 2);
        return { start: dStart.toISOString().split('T')[0], end: dEnd.toISOString().split('T')[0] };
    };
    const { start: initStart, end: initEnd } = getDefaultDates();
    const [startDate, setStartDate] = useState(initStart);
    const [endDate, setEndDate] = useState(initEnd);

    const handleDateValidation = (start: string, end: string) => {
        if (start && end) {
            const d1 = new Date(start);
            const d2 = new Date(end);
            if ((d2.getTime() - d1.getTime()) > 31622400000) { // 366 dias
                alert('Atenção: O período selecionado não pode ser maior que 1 ano. A data limite foi ajustada.');
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
    const [techFilter, setTechFilter] = useState('ALL');
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [selectedItem, setSelectedItem] = useState<any | null>(null);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [showFilters, setShowFilters] = useState(false);

    // Form de Baixa
    const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
    const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
    const [printItem, setPrintItem] = useState<any | null>(null);
    const [paymentMethod, setPaymentMethod] = useState('Dinheiro');
    const [installments, setInstallments] = useState(2);
    const [billingNotes, setBillingNotes] = useState('');
    const [billingDiscount, setBillingDiscount] = useState(0);
    const [billingDiscountType, setBillingDiscountType] = useState<'fixed' | 'percent'>('fixed');
    const [isProcessing, setIsProcessing] = useState(false);

    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 12;

    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({
        key: 'date',
        direction: 'desc'
    });

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
        // Coletar apenas vínculos de O.S. que já constam na lista de faturamento (Concluídas)
        // Isso permite que os orçamentos apareçam "soltos" enquanto a O.S. estiver em andamento.
        const linkedToCompletedOrders = new Set<string>();
        orders.forEach(o => {
            if (o.status === OrderStatus.COMPLETED && o.linkedQuotes) {
                o.linkedQuotes.forEach(id => linkedToCompletedOrders.add(id));
            }
        });

        const approvedQuotes = quotes
            .filter(q => {
                const bSt = q.billingStatus?.toUpperCase() || '';
                const st = q.status?.toUpperCase() || '';
                
                // Exibe incondicionalmente se já foi liquidado
                if (bSt === 'PAID') return true;
                
                // Se não foi liquidado, exige status adequado (aprovado/convertido)
                if (st !== 'APROVADO' && st !== 'CONVERTIDO') return false;

                // Esconde apenas se a O.S. vinculada já for uma O.S. concluída visível na tabela
                // para não causar dupla contagem de valores simultâneos e pendentes
                if (linkedToCompletedOrders.has(q.id)) return false;

                return true;
            })
            .map(q => ({
                type: 'QUOTE' as const,
                id: q.id,
                displayId: q.displayId || null,
                customerName: q.customerName,
                customerAddress: q.customerAddress,
                title: q.title,
                description: q.description,
                date: q.approvedAt || (q as any).updatedAt || q.createdAt,
                createdAt: q.createdAt,
                updatedAt: (q as any).updatedAt || q.createdAt,
                paidAt: q.paidAt || null,
                value: Number(q.totalValue) || 0,
                status: (q.billingStatus || 'PENDING').toUpperCase(),
                original: q,
                billingDiscount: q.discount || 0,
                billingDiscountType: q.discountType || 'fixed',
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
                        
                        // Proteção contra cobrança dupla: 
                        // Se a O.S. ainda está PENDENTE financeiramente, mas o orçamento já foi PAGO,
                        // não agregamos o valor dele aqui.
                        if (order.billingStatus !== 'PAID' && q?.billingStatus === 'PAID') {
                            return acc;
                        }
                        
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
                    billingDiscount: order.discount || 0,
                    billingDiscountType: order.discountType || 'fixed',
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

    const sortedItems = useMemo(() => {
        let sortableItems = [...filteredItems];
        if (sortConfig.key) {
            sortableItems.sort((a, b) => {
                let aValue: any = a[sortConfig.key as keyof typeof a];
                let bValue: any = b[sortConfig.key as keyof typeof b];

                if (sortConfig.key === 'displayId') {
                    aValue = a.displayId || a.id;
                    bValue = b.displayId || b.id;
                } else if (sortConfig.key === 'customerName') {
                    aValue = a.customerName?.toLowerCase() || '';
                    bValue = b.customerName?.toLowerCase() || '';
                } else if (sortConfig.key === 'title') {
                    aValue = a.title?.toLowerCase() || '';
                    bValue = b.title?.toLowerCase() || '';
                } else if (sortConfig.key === 'technician') {
                    aValue = a.technician?.toLowerCase() || '';
                    bValue = b.technician?.toLowerCase() || '';
                } else if (sortConfig.key === 'date') {
                    aValue = new Date(a.date).getTime();
                    bValue = new Date(b.date).getTime();
                } else if (sortConfig.key === 'paidAt') {
                    aValue = a.paidAt ? new Date(a.paidAt).getTime() : 0;
                    bValue = b.paidAt ? new Date(b.paidAt).getTime() : 0;
                } else if (sortConfig.key === 'value') {
                    aValue = Number(a.value);
                    bValue = Number(b.value);
                } else if (sortConfig.key === 'status') {
                    aValue = a.status;
                    bValue = b.status;
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
        return sortableItems;
    }, [filteredItems, sortConfig]);

    const paginatedItems = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        return sortedItems.slice(start, start + ITEMS_PER_PAGE);
    }, [sortedItems, currentPage]);

    const totalPages = Math.ceil(sortedItems.length / ITEMS_PER_PAGE);

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
        const baseAmount = selectedIds.length === 1 ? (selectedItem?.value || 0) : selectedTotal;
        const discountValue = billingDiscountType === 'percent' ? (baseAmount * billingDiscount / 100) : billingDiscount;
        const finalAmount = Math.max(0, baseAmount - discountValue);
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
                            linkedQuotes: (selectedItem.original as any)?.linkedQuotes ?? (rawItem.original as any)?.linkedQuotes
                        }
                    }
                    : rawItem;

                if (item.type === 'ORDER') {
                    // Atualiza O.S. principal — preserva desconto original se nenhum extra foi informado
                    const effectiveDiscount = billingDiscount > 0 ? billingDiscount : (item.original?.discount || 0);
                    const effectiveDiscountType = billingDiscount > 0 ? billingDiscountType : (item.original?.discountType || 'fixed');
                    await DataService.updateOrder({
                        ...(item.original as ServiceOrder),
                        billingStatus: 'PAID',
                        paymentMethod: finalMethod,
                        billingNotes: billingNotes,
                        discount: effectiveDiscount,
                        discountType: effectiveDiscountType,
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
                    // Usa desconto do billing se informado, senão mantém o desconto original do orçamento
                    const effectiveDiscount = billingDiscount > 0 ? billingDiscount : (item.original?.discount || 0);
                    const effectiveDiscountType = billingDiscount > 0 ? billingDiscountType : (item.original?.discountType || 'fixed');
                    await DataService.updateQuote({
                        ...item.original,
                        billingStatus: 'PAID',
                        paymentMethod: finalMethod,
                        billingNotes: billingNotes,
                        discount: effectiveDiscount,
                        discountType: effectiveDiscountType,
                        paidAt
                    });
                }

                // Registra no fluxo de caixa
                try {
                    await DataService.registerCashFlow({
                        type: 'INCOME',
                        category: item.type === 'ORDER' ? 'Serviço (O.S.)' : 'Venda (Orçamento)',
                        amount: finalAmount,
                        description: `Faturamento de ${item.type === 'ORDER' ? 'O.S.' : 'Orçamento'} ${item.displayId || '#' + item.id.slice(0, 8)} — Cliente: ${item.customerName}${discountValue > 0 ? ` (Desconto: R$ ${discountValue.toFixed(2)})` : ''}`,
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
                    original: { ...prev.original, billingStatus: 'PAID', paymentMethod: finalMethod, paidAt, discount: billingDiscount, discountType: billingDiscountType }
                }) : null);
            }

            setSelectedIds([]);
            setIsInvoiceModalOpen(false);
            setPaymentMethod('Dinheiro');
            setBillingNotes('');
            setBillingDiscount(0);
            setBillingDiscountType('fixed');
            await onRefresh();
        } catch (error: any) {
            alert(`Erro ao processar faturamento: ${error.message}`);
        } finally {
            setIsProcessing(false);
        }
    };

    // ── Handler de Impressão ──────────────────────────────────────────────────
    const handlePrint = (item: any) => {
        // DEBUG: ver campos de desconto disponíveis
        console.log('[PRINT DEBUG] item:', {
            value: item.value,
            billingDiscount: item.billingDiscount,
            billingDiscountType: item.billingDiscountType,
            'original.discount': item.original?.discount,
            'original.discountType': item.original?.discountType,
            'original.totalValue': item.original?.totalValue,
            fullOriginal: item.original
        });
        setPrintItem(item);
        setIsPrintModalOpen(true);
    };

    const executePrint = () => {
        window.print();
    };

    const handleExportExcel = () => {
        if (selectedIds.length === 0) return;

        const itemsToExport = filteredItems.filter(i => selectedIds.includes(i.id));

        if (itemsToExport.length === 0) return;

        const formatDateTime = (dateStr?: string) => {
            if (!dateStr || dateStr === 'N/A') return 'N/A';
            try {
                const d = new Date(dateStr);
                if (isNaN(d.getTime())) return dateStr;
                return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
            } catch {
                return dateStr;
            }
        };

        const formatDate = (dateStr?: string) => {
            if (!dateStr || dateStr === 'N/A') return 'N/A';
            try {
                const d = new Date(dateStr + (dateStr.length === 10 ? 'T12:00:00' : ''));
                if (isNaN(d.getTime())) return dateStr;
                return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
            } catch {
                return dateStr;
            }
        };

        const headers = [
            'ID / Protocolo',
            'Tipo do Documento',
            'Data Agendada',
            'Hora Agendada',
            'Cliente',
            'Título',
            'Descrição',
            'Tipo de Atendimento',
            'Técnico',
            'Status Operacional',
            'Prioridade',
            'Valor Total',
            'Status Financeiro',
            'Data de Abertura',
            'Data de Conclusão / Baixa'
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

        const rows = itemsToExport.map(item => {
            const isOrder = item.type === 'ORDER';
            const orig: any = item.original || {};
            return [
                item.displayId || item.id.slice(0, 8).toUpperCase(),
                isOrder ? 'O.S.' : 'Orçamento',
                formatDate(orig.scheduledDate),
                orig.scheduledTime || 'N/A',
                item.customerName || 'N/A',
                item.title || 'N/A',
                item.description || 'N/A',
                orig.operationType || 'Não informado',
                item.technician || 'N/A',
                orig.status || 'N/A',
                orig.priority || 'N/A',
                item.value || 0,
                item.status === 'PAID' ? 'Faturado' : 'Pendente',
                formatDateTime(item.createdAt),
                formatDateTime(item.paidAt || item.updatedAt)
            ];
        });

        const wsData = [headers, ...rows];
        const ws = XLSX.utils.aoa_to_sheet(wsData);

        ws['!cols'] = [
            { wch: 15 }, // ID
            { wch: 18 }, // Tipo Documento
            { wch: 15 }, // Data Agendada
            { wch: 15 }, // Hora Agendada
            { wch: 30 }, // Cliente
            { wch: 30 }, // Título
            { wch: 40 }, // Descrição
            { wch: 20 }, // Tipo Atendimento
            { wch: 20 }, // Técnico
            { wch: 18 }, // Status Operacional
            { wch: 15 }, // Prioridade
            { wch: 15 }, // Valor Final
            { wch: 18 }, // Status Financeiro
            { wch: 20 }, // Abertura
            { wch: 20 }  // Conclusão
        ];

        const range = XLSX.utils.decode_range(ws['!ref'] || "A1:A1");
        for (let C = range.s.c; C <= range.e.c; ++C) {
            const address = XLSX.utils.encode_cell({ r: 0, c: C });
            if (!ws[address]) continue;
            ws[address].s = headerStyle;
        }

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Financeiro");
        XLSX.writeFile(wb, `Nexus_Financeiro_${new Date().toISOString().split('T')[0]}.xlsx`);
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

    const requestSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const getSortIcon = (columnKey: string) => {
        if (sortConfig.key !== columnKey) return <ArrowUpDown size={10} className="text-slate-300 ml-1.5 opacity-0 group-hover:opacity-100 transition-opacity" />;
        return sortConfig.direction === 'asc' 
            ? <ArrowUp size={10} className="text-[#1c2d4f] ml-1.5" /> 
            : <ArrowDown size={10} className="text-[#1c2d4f] ml-1.5" />;
    };

    return (
        <div className="p-4 animate-fade-in flex flex-col h-full bg-slate-50/20 overflow-hidden relative font-sans">

            {/* ── FILTROS + STATS ── */}
            <div className="flex-shrink-0 space-y-4 mb-4">
                {/* Row 1: Search & Toggle & Export */}
                <div className="flex flex-col xl:flex-row gap-3 items-center w-full">
                    <div className="flex w-full xl:w-auto flex-1 gap-3">
                        <div className="relative flex-1 group">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#1c2d4f] transition-colors" size={15} />
                            <input
                                type="text"
                                placeholder="Pesquisar por cliente, protocolo ou ORC..."
                                className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 text-xs font-medium text-slate-700 outline-none focus:ring-2 focus:ring-[#1c2d4f]/10 transition-all shadow-sm"
                                value={searchTerm}
                                onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                            />
                        </div>
                        <button
                            onClick={() => setShowFilters(!showFilters)}
                            className={`flex items-center gap-2 px-4 h-11 rounded-xl border transition-all text-[10px] font-bold ${showFilters ? 'bg-slate-800 border-slate-800 text-slate-200 shadow-inner' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50 shadow-sm'}`}
                        >
                            <Filter size={14} /> {showFilters ? 'Ocultar Filtros' : 'Filtros'}
                        </button>
                    </div>

                    <div className="flex items-center gap-3 ml-auto w-full xl:w-auto justify-end">


                        {/* Ações em Lote (Seleção) - Realocado para o Header */}
                        {selectedIds.length > 0 && (
                            <div className="flex items-center gap-3 px-4 py-1.5 bg-slate-900 rounded-[1.5rem] shadow-2xl animate-in fade-in slide-in-from-right-4 ring-4 ring-slate-100/50 h-11">
                                <div className="flex flex-col pr-3 border-r border-slate-700 justify-center">
                                    <span className="text-[9px] font-black text-slate-400 uppercase leading-none mb-0.5">Sel.</span>
                                    <span className="text-xs font-black text-white leading-none tracking-wider">{selectedIds.length}</span>
                                </div>
                                <div className="flex flex-col pr-3 border-r border-slate-700 justify-center">
                                    <span className="text-[9px] font-black text-emerald-500 uppercase leading-none mb-0.5">Total</span>
                                    <span className="text-[11px] font-black text-emerald-400 leading-none tracking-wide">{formatCurrency(selectedTotal)}</span>
                                </div>

                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={handleExportExcel}
                                        className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-white rounded-lg text-[10px] font-black uppercase transition-all shadow-lg shadow-emerald-500/20 active:scale-95 whitespace-nowrap"
                                        title="Exportar Seleção para Excel"
                                    >
                                        <FileSpreadsheet size={14} /> Excel
                                    </button>

                                    <button
                                        onClick={handleInvoiceBatch}
                                        className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-800 text-white rounded-lg text-[10px] font-black uppercase transition-all shadow-lg shadow-slate-800/20 active:scale-95 whitespace-nowrap"
                                        title="Faturar Seleção"
                                    >
                                        <DollarSign size={14} /> Faturar
                                    </button>

                                    <div className="w-px h-5 bg-slate-700 mx-1" />

                                    <button
                                        onClick={() => setSelectedIds([])}
                                        className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-all ring-1 ring-transparent hover:ring-rose-200"
                                        title="Limpar Seleção"
                                    >
                                        <X size={16} />
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Collapsible Filters */}
                {showFilters && (
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 p-4 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200 animate-in fade-in slide-in-from-top-2 duration-200">
                        <div className="md:col-span-6 flex flex-col gap-1.5">
                            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest px-1">Período de Referência</label>
                            <div className="flex bg-white border border-slate-200 rounded-xl shadow-lg shadow-slate-200/50 px-3 items-center gap-2 h-10">
                                <Calendar size={13} className="text-[#1c2d4f] shrink-0" />
                                <input type="date" value={startDate} onChange={e => handleDateValidation(e.target.value, endDate)} className="bg-transparent border-none text-[10px] font-bold uppercase text-slate-600 outline-none cursor-pointer w-full py-2" />
                                <Slash size={10} className="text-slate-300 shrink-0" />
                                <input type="date" value={endDate} onChange={e => handleDateValidation(startDate, e.target.value)} className="bg-transparent border-none text-[10px] font-bold uppercase text-slate-600 outline-none cursor-pointer w-full py-2" />
                            </div>
                        </div>
                        <div className="md:col-span-3 flex flex-col gap-1.5">
                            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest px-1">Técnico / Responsável</label>
                            <div className="flex bg-white border border-slate-200 rounded-xl shadow-lg shadow-slate-200/50 px-3 items-center gap-2 h-10">
                                <UserCheck size={13} className="text-[#1c2d4f] shrink-0" />
                                <select className="bg-transparent text-[10px] font-bold uppercase text-slate-600 outline-none cursor-pointer w-full py-2.5" value={techFilter} onChange={e => { setTechFilter(e.target.value); setCurrentPage(1); }}>
                                    <option value="ALL">Técnicos (Todos)</option>
                                    {techs.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                                    <option value="Administrador">Admin</option>
                                </select>
                            </div>
                        </div>
                        <div className="md:col-span-3 flex flex-col gap-1.5">
                            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest px-1">Estado do Lançamento</label>
                            <div className="flex bg-white border border-slate-200 rounded-xl shadow-lg shadow-slate-200/50 px-3 items-center gap-2 h-10">
                                <Layer size={13} className="text-[#1c2d4f] shrink-0" />
                                <select className="bg-transparent text-[10px] font-bold uppercase text-slate-600 outline-none cursor-pointer w-full py-2.5" value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setCurrentPage(1); }}>
                                    <option value="ALL">Status (Todos)</option>
                                    <option value="PENDING">Pendente</option>
                                    <option value="PAID">Faturado</option>
                                </select>
                            </div>
                        </div>
                    </div>
                )}

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
            <div className="bg-white border border-slate-200 rounded-2xl flex flex-col overflow-hidden flex-1 min-h-0 shadow-xl shadow-slate-200/30 relative">
                <div className="flex-1 overflow-auto">
                    <table className="w-full text-left">
                        <thead className="sticky top-0 bg-slate-200/60 backdrop-blur-md z-10 border-b border-slate-300 shadow-sm font-poppins">
                            <tr className="text-[12px] font-semibold text-slate-600 tracking-tight text-left">
                                <th className="px-3 py-3 w-10 text-center">
                                    <input type="checkbox" className="w-3.5 h-3.5 rounded border-slate-200 text-[#1c2d4f] cursor-pointer" checked={paginatedItems.length > 0 && paginatedItems.every(i => selectedIds.includes(i.id))} onChange={() => { 
                                        const pageIds = paginatedItems.map(i => i.id);
                                        const allSelected = pageIds.every(id => selectedIds.includes(id));
                                        if (allSelected) {
                                            setSelectedIds(prev => prev.filter(id => !pageIds.includes(id)));
                                        } else {
                                            setSelectedIds(prev => Array.from(new Set([...prev, ...pageIds])));
                                        }
                                     }} title="Selecionar página atual" />
                                </th>
                                <th className="px-4 py-3 cursor-pointer group select-none hover:bg-slate-50 transition-colors" onClick={() => requestSort('displayId')}>
                                    <div className="flex items-center">Protocolo {getSortIcon('displayId')}</div>
                                </th>
                                <th className="px-4 py-3 cursor-pointer group select-none hover:bg-slate-50 transition-colors" onClick={() => requestSort('customerName')}>
                                    <div className="flex items-center">Cliente {getSortIcon('customerName')}</div>
                                </th>
                                <th className="px-4 py-3 cursor-pointer group select-none hover:bg-slate-50 transition-colors" onClick={() => requestSort('title')}>
                                    <div className="flex items-center">Descrição {getSortIcon('title')}</div>
                                </th>
                                <th className="px-4 py-3 cursor-pointer group select-none hover:bg-slate-50 transition-colors" onClick={() => requestSort('technician')}>
                                    <div className="flex items-center">Técnico {getSortIcon('technician')}</div>
                                </th>
                                <th className="px-4 py-3 cursor-pointer group select-none hover:bg-slate-50 transition-colors" onClick={() => requestSort('date')}>
                                    <div className="flex items-center">Data {getSortIcon('date')}</div>
                                </th>
                                <th className="px-4 py-3 cursor-pointer group select-none hover:bg-slate-50 transition-colors" onClick={() => requestSort('paidAt')}>
                                    <div className="flex items-center">Pgto {getSortIcon('paidAt')}</div>
                                </th>
                                <th className="px-4 py-3 cursor-pointer group select-none hover:bg-slate-50 transition-colors" onClick={() => requestSort('value')}>
                                    <div className="flex items-center">Valor {getSortIcon('value')}</div>
                                </th>
                                <th className="px-4 py-3 text-center cursor-pointer group select-none hover:bg-slate-50 transition-colors" onClick={() => requestSort('status')}>
                                    <div className="flex items-center justify-center">Status {getSortIcon('status')}</div>
                                </th>
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
                                        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-lg w-fit whitespace-nowrap ${item.type === 'QUOTE' ? 'bg-[#1c2d4f]/10 text-[#1c2d4f]' : 'bg-slate-100 text-slate-600'}`}>
                                            {getDocLabel(item)}
                                        </span>
                                    </td>
                                    <td className="px-4 py-2.5">
                                        <p className="text-[13px] font-medium text-slate-800 truncate max-w-[150px]">{item.customerName}</p>
                                    </td>
                                    <td className="px-4 py-2.5">
                                        <p className="text-[12px] text-slate-600 truncate max-w-[180px]">{item.title}</p>
                                    </td>
                                    <td className="px-4 py-2.5">
                                        <span className="text-[12px] text-slate-700 capitalize">{item.technician?.toLowerCase()}</span>
                                    </td>
                                    <td className="px-4 py-2.5">
                                        <div className="flex flex-col gap-0.5">
                                            <span className="text-[12px] text-slate-600 whitespace-nowrap">{new Date(item.date).toLocaleDateString('pt-BR')}</span>
                                            <span className="text-[10px] text-slate-400 tracking-wider">{item.type === 'QUOTE' ? 'Criação' : 'Conclusão'}</span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-2.5">
                                        <div className="flex flex-col gap-0.5">
                                            {item.paidAt ? (
                                                <>
                                                    <span className="text-[12px] text-emerald-600 whitespace-nowrap">{new Date(item.paidAt).toLocaleDateString('pt-BR')}</span>
                                                    <span className="text-[10px] text-emerald-400 tracking-wider">Faturado</span>
                                                </>
                                            ) : (
                                                <span className="text-[12px] text-slate-400">—</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-4 py-2.5">
                                        <div className="flex flex-col gap-0.5">
                                            <span className="text-[15px] font-medium text-slate-900">
                                                {formatCurrency(item.value)}
                                            </span>
                                            {item.original?.discount > 0 && (
                                                <span className="text-[9px] text-rose-500 font-bold uppercase tracking-widest mt-0.5">
                                                    {item.original.discountType === 'percent' ? `Desc. Aplicado (${item.original.discount}%)` : `Desc. Aplicado (-${formatCurrency(item.original.discount)})`}
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-4 py-2.5 text-center">
                                        <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium tracking-wide ${item.status === 'PAID' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
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



            {/* ── PAINEL DE DETALHES (Centrado no meio com formato Padrão OS) ── */}
            {isSidebarOpen && selectedItem && (
                <div className="fixed inset-0 z-[1200] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center py-4 px-4 overflow-y-auto animate-fade-in" onClick={() => setIsSidebarOpen(false)}>
                    <div className="bg-white w-full max-w-6xl max-h-[92vh] rounded-xl shadow-2xl flex flex-col overflow-hidden border border-slate-200 relative" onClick={e => e.stopPropagation()}>

                        {/* Cabeçalho OS padrão minimalista (Big Tech) */}
                        <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center shrink-0 bg-white">
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-lg flex items-center justify-center border bg-slate-50 border-slate-200 text-slate-400">
                                    {selectedItem.type === 'QUOTE' ? <FileText size={20} /> : <Wrench size={20} />}
                                </div>
                                <div>
                                    <div className="flex items-center gap-3">
                                        <h2 className="text-base font-semibold text-slate-900 font-poppins">
                                            {selectedItem.type === 'QUOTE' ? 'Orçamento' : 'Ordem de Serviço'} #{getDocLabel(selectedItem)}
                                        </h2>
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${selectedItem.status === 'PAID' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-amber-50 text-amber-600 border-amber-200'}`}>
                                            {selectedItem.status === 'PAID' ? 'Faturado' : 'Pendente'}
                                        </span>
                                    </div>
                                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                                        {selectedItem.title || (selectedItem.type === 'QUOTE' ? 'Criação' : 'Conclusão')}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => {
                                        const route = selectedItem.type === 'QUOTE' ? 'view-quote' : 'view';
                                        const token = selectedItem.original?.publicToken || selectedItem.id;
                                        window.open(`${window.location.origin}/#/${route}/${token}`, '_blank');
                                    }}
                                    className="h-9 px-4 gap-2 border border-primary-200 text-primary-700 hover:bg-primary-50 rounded-lg text-xs font-bold transition-all flex items-center"
                                >
                                    <Share2 size={14} /> Link Público
                                </button>
                                <button
                                    onClick={() => handlePrint(selectedItem)}
                                    className="h-9 px-4 gap-2 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg text-xs font-bold transition-all flex items-center"
                                >
                                    <Printer size={14} /> Imprimir
                                </button>
                                <div className="h-6 w-px bg-slate-200 mx-2"></div>
                                <button onClick={() => setIsSidebarOpen(false)} className="p-2 text-slate-400 hover:text-slate-900 transition-all rounded-full hover:bg-slate-50">
                                    <X size={20} />
                                </button>
                            </div>
                        </div>

                        {/* Corpo principal */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-5">

                            {/* Cards de Informação */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* Cliente */}
                                <div className="bg-white rounded-2xl border border-slate-200 shadow-lg shadow-slate-200/50 p-5">
                                    <div className="flex items-center gap-2 pb-3 border-b border-slate-200 mb-4">
                                        <div className="w-7 h-7 rounded-lg bg-slate-50 flex items-center justify-center border border-slate-200 text-slate-500"><Users size={13} /></div>
                                        <h3 className="text-xs font-black text-slate-800 tracking-wide">Dados do cliente</h3>
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
                                <div className="bg-white rounded-2xl border border-slate-200 shadow-lg shadow-slate-200/50 p-5 relative overflow-hidden">
                                    <p className="text-xs font-bold text-slate-500 tracking-wider mb-1">Valor Total</p>
                                    <p className="text-3xl font-black tracking-tight border-b border-slate-100 pb-2 mb-2 text-slate-900">
                                        {formatCurrency(selectedItem.value)}
                                    </p>
                                    {selectedItem.original?.discount > 0 && (
                                        <div className="flex justify-between items-center mb-2">
                                            <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest">Desconto Aplicado</p>
                                            <p className="text-xs font-bold text-rose-500">
                                                {selectedItem.original.discountType === 'percent' 
                                                    ? `- ${selectedItem.original.discount}%` 
                                                    : `- ${formatCurrency(selectedItem.original.discount)}`}
                                            </p>
                                        </div>
                                    )}
                                    <div className="flex items-center gap-2 mt-4">
                                        <div className="w-6 h-6 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-center"><Calendar size={12} className="text-slate-400" /></div>
                                        <p className="text-[10px] font-bold text-slate-600">{new Date(selectedItem.date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Técnico + Descrição */}
                            <div className="bg-white rounded-2xl border border-slate-200 shadow-lg shadow-slate-200/50 p-5">
                                <div className="flex items-center gap-2 pb-3 border-b border-slate-200 mb-4">
                                    <div className="w-7 h-7 rounded-lg bg-slate-50 flex items-center justify-center border border-slate-200 text-slate-500"><Info size={13} /></div>
                                    <h3 className="text-xs font-black text-slate-800 tracking-wide">Descrição do atendimento</h3>
                                </div>
                                <div className="flex items-center gap-3 mb-4 p-3 bg-slate-50 border border-slate-100 rounded-xl">
                                    <div className="w-8 h-8 bg-white border border-slate-200 rounded-lg flex items-center justify-center">
                                        <UserCheck size={15} className="text-slate-500" />
                                    </div>
                                    <div>
                                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Técnico designado</p>
                                        <p className="text-xs font-bold text-slate-700 capitalize">{selectedItem.technician?.toLowerCase()}</p>
                                    </div>
                                </div>
                                {selectedItem.description && <p className="text-xs text-slate-600 font-medium leading-relaxed italic">{selectedItem.description}</p>}
                            </div>

                            {/* Orçamentos vinculados (somente OS) */}
                            {selectedItem.type === 'ORDER' && (
                                <div className="bg-white rounded-2xl border border-slate-200 shadow-lg shadow-slate-200/50 p-5">
                                    <div className="flex items-center gap-2 pb-3 border-b border-slate-200 mb-4">
                                        <div className="w-7 h-7 rounded-lg bg-slate-50 flex items-center justify-center border border-slate-200 text-slate-500"><Layer size={13} /></div>
                                        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-800">Orçamentos Vinculados</h3>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        {selectedItem.original.linkedQuotes?.map((qId: string) => {
                                            const q = quotes.find(quote => quote.id === qId);
                                            return q ? (
                                                <div key={qId} className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex justify-between items-center">
                                                    <div>
                                                        <span className="text-[9px] font-black text-slate-500 uppercase">{q.displayId || 'ORC-' + qId.slice(0, 8).toUpperCase()}</span>
                                                        <p className="text-xs font-bold text-slate-800 mt-0.5 truncate max-w-[150px]">{q.title}</p>
                                                    </div>
                                                    <span className="text-sm font-black text-slate-900">{formatCurrency(q.totalValue)}</span>
                                                </div>
                                            ) : null;
                                        })}
                                        {(!selectedItem.original.linkedQuotes || selectedItem.original.linkedQuotes.length === 0) && (
                                            <div className="col-span-full py-6 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
                                                <p className="text-[10px] text-slate-400 font-bold uppercase">Nenhum orçamento vinculado</p>
                                            </div>
                                        )}
                                        {availableQuotesForClient.length > 0 && selectedItem.status !== 'PAID' && (
                                            <div className="col-span-full pt-3 border-t border-slate-100 mt-2">
                                                <p className="text-[9px] font-black text-slate-400 uppercase mb-2">Disponíveis para vincular:</p>
                                                <div className="flex flex-wrap gap-2">
                                                    {availableQuotesForClient.map(q => (
                                                        <button key={q.id} onClick={() => handleLinkQuote(q.id)} disabled={isProcessing} className="px-3 py-2 bg-white border border-slate-200 rounded-xl flex items-center gap-2 hover:border-slate-300 hover:bg-slate-50 transition-all text-[10px] font-bold text-slate-700 uppercase shadow-sm">
                                                            {q.displayId || 'ORC-' + q.id.slice(0, 8).toUpperCase()} — {formatCurrency(q.totalValue)}
                                                            <Plus size={12} className="text-slate-400" />
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

                        </div>

                        {/* Footer de Ação */}
                        <div className="px-6 py-4 bg-slate-50 flex justify-end gap-3 z-10 sticky bottom-0 border-t border-slate-200 rounded-b-xl">
                            <button onClick={() => setIsSidebarOpen(false)} className="px-6 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:text-slate-800 shadow-sm transition-all hover:bg-slate-50">
                                Fechar Painel
                            </button>
                            {selectedItem.status !== 'PAID' ? (
                                <button
                                    onClick={() => { setSelectedIds([selectedItem.id]); setIsInvoiceModalOpen(true); }}
                                    className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2"
                                >
                                    <DollarSign size={18} /> Confirmar Lançamento Financeiro
                                </button>
                            ) : (
                                <div className="px-6 py-2.5 bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-xl font-bold text-sm text-center flex items-center justify-center gap-2 shadow-inner">
                                    <CheckCircle2 size={18} /> Lançamento Liquidado
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ── MODAL DE FATURAMENTO (Padrão OS Big Tech) ── */}
            {isInvoiceModalOpen && (
                <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in" onClick={() => setIsInvoiceModalOpen(false)}>
                    <div className="bg-white rounded-xl w-full max-w-4xl max-h-[92vh] shadow-2xl flex flex-col overflow-hidden border border-slate-200" onClick={e => e.stopPropagation()}>
                        
                        {/* HEADER - Padrão OS */}
                        <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center shrink-0 bg-white">
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-lg flex items-center justify-center border bg-slate-50 border-slate-200 text-slate-400">
                                    <ShieldCheck size={20} />
                                </div>
                                <div>
                                    <div className="flex items-center gap-3">
                                        <h2 className="text-base font-semibold text-slate-900 font-poppins">Liquidação Financeira</h2>
                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-emerald-50 text-emerald-600 border border-emerald-200">
                                            Checkout
                                        </span>
                                    </div>
                                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                                        {selectedIds.length === 1 ? (selectedItem ? getDocLabel(selectedItem) : 'Transação') : `${selectedIds.length} Documentos selecionados`} • {selectedIds.length === 1 ? selectedItem?.customerName : 'Múltiplos clientes'}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button onClick={() => setIsInvoiceModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-900 transition-all">
                                    <X size={20} />
                                </button>
                            </div>
                        </div>

                        {/* BODY - SCROLLABLE BG-SLATE-50 */}
                        <div className="flex-1 overflow-y-auto bg-slate-50 p-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl mx-auto">
                                
                                {/* Lado Esquerdo - Detalhes e Resumo */}
                                <div className="space-y-6">
                                    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:border-slate-300 transition-all">
                                        <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                                            <Layers size={16} className="text-slate-400"/> Documentos a Faturar
                                        </h3>
                                        <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-100">
                                            <div>
                                                <p className="text-sm font-bold text-slate-700">{selectedIds.length === 1 ? (selectedItem ? getDocLabel(selectedItem) : '—') : `${selectedIds.length} Itens Lançados`}</p>
                                                <p className="text-xs text-slate-500 font-medium mt-0.5">{selectedIds.length === 1 ? selectedItem?.customerName : 'Múltiplos clientes'}</p>
                                            </div>
                                            <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-sm text-slate-400">
                                                <Wallet size={16} />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:border-slate-300 transition-all">
                                        <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                                            <DollarSign size={16} className="text-slate-400"/> Resumo Financeiro
                                        </h3>
                                        <div className="space-y-3">
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-slate-500 font-medium">Subtotal</span>
                                                <span className="font-bold text-slate-700">{formatCurrency(selectedIds.length === 1 ? (selectedItem?.value || 0) : selectedTotal)}</span>
                                            </div>
                                            {(() => {
                                                const base = selectedIds.length === 1 ? (selectedItem?.value || 0) : selectedTotal;
                                                const dv = billingDiscountType === 'percent' ? (base * billingDiscount / 100) : billingDiscount;
                                                return dv > 0 ? (
                                                    <div className="flex justify-between items-center text-sm">
                                                        <span className="text-rose-500 font-medium tracking-wide">Desconto</span>
                                                        <span className="font-bold text-rose-500">- {formatCurrency(dv)}</span>
                                                    </div>
                                                ) : null;
                                            })()}
                                            <div className="pt-4 mt-3 border-t border-slate-100 flex justify-between items-center">
                                                <span className="text-xs font-black text-slate-800 uppercase tracking-widest">Total a Receber</span>
                                                <span className="text-2xl font-black text-emerald-600 tracking-tight">{formatCurrency(Math.max(0, (() => { const base = selectedIds.length === 1 ? (selectedItem?.value || 0) : selectedTotal; const dv = billingDiscountType === 'percent' ? (base * billingDiscount / 100) : billingDiscount; return base - dv; })()))}</span>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:border-slate-300 transition-all">
                                        <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                                            <FileText size={16} className="text-slate-400"/> Observações e Comprovante
                                        </h3>
                                        <textarea
                                            className="w-full min-h-[100px] bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-slate-800/20 focus:border-slate-800 transition-all resize-none placeholder:text-slate-400"
                                            placeholder="Ex: Nº do comprovante transacional, código Pix, NSU da maquineta..."
                                            value={billingNotes}
                                            onChange={e => setBillingNotes(e.target.value)}
                                        />
                                    </div>
                                </div>

                                {/* Lado Direito - Pagamento e Parcelas */}
                                <div className="space-y-6">
                                    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:border-slate-300 transition-all">
                                        <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                                            <CreditCard size={16} className="text-slate-400"/> Forma de Pagamento
                                        </h3>
                                        <div className="grid grid-cols-3 gap-3">
                                            {paymentMethods.map(method => (
                                                <button
                                                    key={method.id}
                                                    onClick={() => setPaymentMethod(method.id)}
                                                    className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-all shadow-sm ${paymentMethod === method.id
                                                        ? 'bg-slate-800 border-slate-800 text-slate-200'
                                                        : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50'}`}
                                                >
                                                    <div className="mb-1.5 opacity-80">{method.icon}</div>
                                                    <span className="text-[10px] font-bold uppercase tracking-wider text-center">{method.label}</span>
                                                </button>
                                            ))}
                                        </div>

                                        {/* Parcelas */}
                                        {paymentMethod === 'Cartão Crédito' && (
                                            <div className="mt-5 pt-5 border-t border-slate-100 animate-in fade-in">
                                                <h4 className="text-[10px] font-black tracking-widest uppercase text-slate-400 mb-3">Opções de Parcelamento</h4>
                                                
                                                {/* Botões Rápidos 1 a 12 */}
                                                <div className="grid grid-cols-6 gap-2 mb-3">
                                                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(n => (
                                                        <button
                                                            key={n}
                                                            onClick={() => setInstallments(n)}
                                                            className={`py-2 rounded-lg text-[11px] font-black transition-all ${installments === n ? 'bg-slate-800 text-white shadow-md scale-105' : 'bg-white border border-slate-200 text-slate-500 hover:border-slate-800 hover:text-slate-800'}`}
                                                        >
                                                            {n}x
                                                        </button>
                                                    ))}
                                                </div>
                                                
                                                {/* Opção Manual e Resumo */}
                                                <div className="p-3 bg-slate-50 rounded-lg flex flex-col md:flex-row items-center justify-between gap-3 border border-slate-100">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Outro valor:</span>
                                                        <div className="relative">
                                                            <input
                                                                type="number"
                                                                min={1}
                                                                max={999}
                                                                value={installments || ''}
                                                                onChange={e => {
                                                                    const val = parseInt(e.target.value);
                                                                    if (!isNaN(val) && val > 0) setInstallments(val);
                                                                }}
                                                                className="w-16 px-2 pr-6 py-1.5 text-xs font-black text-slate-800 bg-white border border-slate-200 rounded-md outline-none focus:ring-2 focus:ring-slate-800/20 focus:border-slate-800 transition-all text-center"
                                                            />
                                                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-400 pointer-events-none">x</span>
                                                        </div>
                                                    </div>
                                                    
                                                    <div className="flex flex-col items-end">
                                                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-1">Valor da Parcela</span>
                                                        <span className="text-sm font-black text-slate-800">
                                                            {installments}x de {formatCurrency((selectedIds.length === 1 ? (selectedItem?.value || 0) : selectedTotal) / (installments || 1))}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Desconto Extra */}
                                    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:border-slate-300 transition-all">
                                        <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                                            <Tag size={16} className="text-slate-400"/> Aplicar Desconto Extra
                                        </h3>
                                        <div className="flex items-center gap-3">
                                            <div className="flex border border-slate-200 rounded-lg overflow-hidden shrink-0">
                                                <button
                                                    onClick={() => setBillingDiscountType('fixed')}
                                                    className={`px-3 py-2 text-[10px] font-black transition-all ${billingDiscountType === 'fixed' ? 'bg-slate-800 text-white' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}
                                                >R$</button>
                                                <button
                                                    onClick={() => setBillingDiscountType('percent')}
                                                    className={`px-3 py-2 text-[10px] font-black transition-all ${billingDiscountType === 'percent' ? 'bg-slate-800 text-white' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}
                                                >%</button>
                                            </div>
                                            <div className="relative flex-1">
                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">
                                                    {billingDiscountType === 'percent' ? '%' : 'R$'}
                                                </span>
                                                <input
                                                    type="number"
                                                    min={0}
                                                    max={billingDiscountType === 'percent' ? 100 : undefined}
                                                    step={0.01}
                                                    value={billingDiscount || ''}
                                                    onChange={e => setBillingDiscount(parseFloat(e.target.value) || 0)}
                                                    placeholder="0"
                                                    className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-slate-800/20 focus:border-slate-800 transition-all shadow-sm"
                                                />
                                            </div>
                                            {billingDiscount > 0 && (
                                                <button onClick={() => setBillingDiscount(0)} className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all">
                                                    <X size={16} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>

                            </div>
                        </div>

                        {/* FOOTER - Padrão OS */}
                        <div className="px-6 py-4 border-t border-slate-100 bg-white flex justify-end gap-3 shrink-0">
                            <button
                                onClick={() => setIsInvoiceModalOpen(false)}
                                className="h-10 px-5 flex items-center justify-center gap-2 text-slate-500 hover:text-slate-800 font-bold transition-colors bg-white hover:bg-slate-50 rounded-lg border border-transparent hover:border-slate-200"
                            >
                                <X size={16} /> Cancelar
                            </button>
                            <button
                                onClick={confirmInvoice}
                                disabled={isProcessing}
                                className="h-10 px-6 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold shadow-md shadow-emerald-600/20 transition-all disabled:opacity-70 disabled:cursor-not-allowed"
                            >
                                {isProcessing ? (
                                    <><Loader2 size={16} className="animate-spin" /> Concluindo Baixa...</>
                                ) : (
                                    <><CheckCircle2 size={16} /> Confirmar Liquidação</>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── MODAL DE IMPRESSÃO / RECIBO DE FATURAMENTO ── */}
            {isPrintModalOpen && printItem && (
                <div className="fixed inset-0 z-[3000] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in print:bg-white print:p-0 print:fixed print:inset-0">
                    <div className="bg-white w-full max-w-3xl max-h-[95vh] overflow-y-auto rounded-3xl shadow-2xl border border-slate-200 print:rounded-none print:max-w-none print:max-h-none print:overflow-visible print:shadow-none print:border-0">

                        {/* Barra de ação — oculta na impressão */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50 print:hidden">
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

                        {/* ─── Conteúdo do Recibo FORMAL SAAS (imprimível) ─── */}
                        <div id="printable-receipt" ref={printRef} className="p-10 bg-white font-poppins min-h-[1056px] flex flex-col relative w-[210mm] mx-auto print:w-full print:p-8">
                            {/* Marca D'Água (Status) */}
                            <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-[0.03] pointer-events-none select-none text-[8rem] font-black uppercase -rotate-45 tracking-widest whitespace-nowrap z-0`}>
                                {printItem.status === 'PAID' ? 'LIQUIDADO' : 'PENDENTE'}
                            </div>

                            <div className="relative z-10 flex-1 flex flex-col">
                                {/* Header SaaS Moderno */}
                                <div className="flex items-start justify-between pb-8 border-b-2 border-slate-200">
                                    <div className="flex items-end gap-6">
                                        {(tenant?.logo_url || tenant?.logoUrl) ? (
                                            <img
                                                src={tenant.logo_url || tenant.logoUrl}
                                                alt={tenant.company_name || tenant.name || 'Logo'}
                                                className="h-16 w-auto object-contain"
                                            />
                                        ) : (
                                            <div className="w-16 h-16 bg-[#1c2d4f] rounded-2xl flex items-center justify-center shadow-lg">
                                                <Wallet size={28} className="text-white" />
                                            </div>
                                        )}
                                        <div>
                                            <h1 className="text-2xl font-black text-slate-800 uppercase tracking-tight leading-none mb-1">
                                                {tenant?.company_name || tenant?.trading_name || tenant?.name || 'Sua Empresa'}
                                            </h1>
                                            {tenant?.cnpj || tenant?.document ? (
                                                <p className="text-[11px] text-slate-500 font-bold uppercase tracking-wide">
                                                    CNPJ: {tenant.cnpj || tenant.document}
                                                </p>
                                            ) : null}
                                            <p className="text-[10px] text-slate-400 mt-1 max-w-xs leading-tight">
                                                {(tenant?.address || tenant?.street) ? `${tenant.street}${tenant.number ? ', ' + tenant.number : ''}${tenant.neighborhood ? ' - ' + tenant.neighborhood : ''}${tenant.city ? ', ' + tenant.city : ''}${tenant.state ? '/' + tenant.state : ''}` : 'Endereço da Empresa Não Informado'}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="text-right">
                                        <div className="inline-block px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg mb-3">
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-0.5">Fatura/Recibo Nº</p>
                                            <p className="text-xl font-bold text-[#1c2d4f] font-mono tracking-tight text-right">
                                                {getDocLabel(printItem)}
                                            </p>
                                        </div>
                                        <p className="text-[10px] font-bold text-slate-500">Data de Emissão: {new Date().toLocaleDateString('pt-BR')}</p>
                                        <p className="text-[10px] font-bold text-slate-400">Vencimento: {new Date(printItem.date).toLocaleDateString('pt-BR')}</p>
                                    </div>
                                </div>

                                {/* Seção: Cobrado A (Cliente) */}
                                <div className="py-8 grid grid-cols-12 gap-8 border-b border-slate-100">
                                    <div className="col-span-7">
                                        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Faturado para:</h3>
                                        <h2 className="text-lg font-bold text-slate-900 capitalize mb-1">{printItem.customerName?.toLowerCase() || 'Cliente Não Identificado'}</h2>
                                        {printItem.customerAddress && (
                                            <p className="text-sm text-slate-600 max-w-md">{printItem.customerAddress}</p>
                                        )}
                                        {printItem.customerDocument && (
                                            <p className="text-xs text-slate-500 font-medium mt-1">Doc: {printItem.customerDocument}</p>
                                        )}
                                    </div>
                                    
                                    <div className="col-span-5 bg-slate-50 p-4 rounded-xl border border-slate-100">
                                        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Detalhes do Documento</h3>
                                        <table className="w-full text-xs">
                                            <tbody>
                                                <tr>
                                                    <td className="py-1 text-slate-500 font-medium">Origem do Ref.:</td>
                                                    <td className="py-1 text-slate-900 font-bold text-right uppercase">{printItem.type === 'QUOTE' ? 'Orçamento' : 'Ordem de Serviço'}</td>
                                                </tr>
                                                <tr>
                                                    <td className="py-1 text-slate-500 font-medium">Status de Pagamento:</td>
                                                    <td className={`py-1 font-bold text-right uppercase ${printItem.status === 'PAID' ? 'text-emerald-600' : 'text-amber-600'}`}>
                                                        {printItem.status === 'PAID' ? 'LIQUIDADO' : 'PENDENTE'}
                                                    </td>
                                                </tr>
                                                {printItem.original?.paymentMethod && (
                                                    <tr>
                                                        <td className="py-1 text-slate-500 font-medium whitespace-nowrap flex items-center pt-2 mt-2 border-t border-slate-200">Meio de Pagamento:</td>
                                                        <td className="py-1 text-slate-900 font-bold text-right pt-2 mt-2 border-t border-slate-200">{printItem.original.paymentMethod}</td>
                                                    </tr>
                                                )}
                                                {printItem.original?.paidAt && (
                                                    <tr>
                                                        <td className="py-1 text-slate-500 font-medium">Data do Recebimento:</td>
                                                        <td className="py-1 text-slate-900 font-bold text-right">{new Date(printItem.original.paidAt).toLocaleDateString('pt-BR')}</td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {/* Tabela de Serviços/Itens */}
                                <div className="mt-8 flex-1">
                                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Descritivo dos Lançamentos</h3>
                                    
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b-2 border-slate-200 text-left">
                                                <th className="py-3 px-2 font-bold text-slate-900 uppercase text-[10px] tracking-wider w-3/5">Descrição do Serviço / Histórico</th>
                                                <th className="py-3 px-2 font-bold text-slate-900 uppercase text-[10px] tracking-wider text-center">Tipo</th>
                                                <th className="py-3 px-2 font-bold text-slate-900 uppercase text-[10px] tracking-wider text-right">Valor Líquido</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {/* Item Principal (A Descrição base da OS/ORC) */}
                                            <tr className="border-b border-slate-100">
                                                <td className="py-4 px-2">
                                                    <p className="font-bold text-slate-800">{printItem.title || 'Serviços Prestados'}</p>
                                                    {printItem.description && (
                                                        <p className="text-xs text-slate-500 mt-1 whitespace-pre-wrap">{printItem.description}</p>
                                                    )}
                                                </td>
                                                <td className="py-4 px-2 text-center text-slate-600 text-xs uppercase font-medium">{printItem.type === 'QUOTE' ? 'ORC' : 'OS'}</td>
                                                <td className="py-4 px-2 text-right font-medium text-slate-900">{formatCurrency(printItem.value)}</td>
                                            </tr>
                                            
                                            {/* Listar orçamentos vinculados caso exista e seja O.S */}
                                            {printItem.type === 'ORDER' && printItem.original?.linkedQuotes?.length > 0 && (() => {
                                                const linkedQts = (printItem.original.linkedQuotes as string[]).map((qId: string) => quotes.find(q => q.id === qId)).filter(Boolean);
                                                return linkedQts.map((q: any) => (
                                                    <tr key={q.id} className="border-b border-slate-100 bg-slate-50/50">
                                                        <td className="py-3 px-2">
                                                            <p className="font-semibold text-slate-700 block"><span className="text-slate-400 font-normal mr-2">Vínculo O.S:</span> {q.title || 'Orçamento Vinculado'}</p>
                                                            <p className="text-xs text-slate-400 mt-0.5">Ref: {q.displayId || q.id.slice(0, 8)}</p>
                                                        </td>
                                                        <td className="py-3 px-2 text-center text-slate-500 text-xs font-medium">SUB-IT</td>
                                                        <td className="py-3 px-2 text-right font-medium text-slate-700">(incluso no principal)</td>
                                                    </tr>
                                                ));
                                            })()}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Resumo de Valores e Totais */}
                                <div className="mt-8 flex justify-end">
                                    <div className="w-1/2 ml-auto">
                                        <table className="w-full text-sm">
                                            <tbody>
                                                {(() => {
                                                    // printItem.value = totalValue já descontado (líquido)
                                                    const netValue = printItem?.value || 0;

                                                    // Tier 1: usar campo discount do DB se disponível
                                                    const storedDisc = Number(printItem?.billingDiscount ?? printItem?.original?.discount ?? 0);
                                                    const storedDiscType: string = printItem?.billingDiscountType ?? printItem?.original?.discountType ?? 'fixed';

                                                    // Tier 2: calcular desconto implícito via items (para registros antigos onde discount foi zerado)
                                                    const originalItems: any[] = printItem?.original?.items || [];
                                                    const itemsGross = originalItems.reduce((acc: number, it: any) => {
                                                        return acc + Number(it.total ?? (it.quantity * it.unitPrice) ?? 0);
                                                    }, 0);
                                                    const impliedDiscountAmount = itemsGross > 0 ? Math.max(0, Math.round((itemsGross - netValue) * 100) / 100) : 0;

                                                    // Escolher estratégia: campo DB > calculado de items
                                                    let grossValue = netValue;
                                                    let discountAmount = 0;
                                                    let discLabel = '';

                                                    if (storedDisc > 0) {
                                                        // Tier 1: temos o valor do campo discount
                                                        if (storedDiscType === 'percent') {
                                                            grossValue = netValue / (1 - storedDisc / 100);
                                                            discountAmount = grossValue - netValue;
                                                            discLabel = `(${storedDisc}%)`;
                                                        } else {
                                                            grossValue = netValue + storedDisc;
                                                            discountAmount = storedDisc;
                                                        }
                                                    } else if (impliedDiscountAmount > 0.01) {
                                                        // Tier 2: desconto calculado dos itens (registro antigo)
                                                        grossValue = itemsGross;
                                                        discountAmount = impliedDiscountAmount;
                                                    }

                                                    const hasDiscount = discountAmount > 0.01;

                                                    return (
                                                        <>
                                                            {hasDiscount && (
                                                                <tr>
                                                                    <td className="py-2 px-4 text-slate-500 text-right font-medium">Valor Nominal (Bruto):</td>
                                                                    <td className="py-2 px-4 text-right font-medium text-slate-800">{formatCurrency(grossValue)}</td>
                                                                </tr>
                                                            )}
                                                            {hasDiscount && (
                                                                <tr>
                                                                    <td className="py-2 px-4 text-rose-500 text-right font-bold italic">
                                                                        Desconto Aplicado {discLabel}:
                                                                    </td>
                                                                    <td className="py-2 px-4 text-right font-bold text-rose-600 italic">
                                                                        - {formatCurrency(discountAmount)}
                                                                    </td>
                                                                </tr>
                                                            )}
                                                            <tr>
                                                                <td className="py-3 px-4 text-[#1c2d4f] font-black text-right border-t-2 border-[#1c2d4f] uppercase text-xs tracking-widest">
                                                                    Total Líquido Recebido:
                                                                </td>
                                                                <td className="py-3 px-4 text-right font-black text-[#1c2d4f] border-t-2 border-[#1c2d4f] text-xl tracking-tighter italic">
                                                                    {formatCurrency(netValue)}
                                                                </td>
                                                            </tr>
                                                        </>
                                                    );
                                                })()}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {/* Assinaturas e Termos */}
                                <div className="mt-auto pt-16">
                                    <div className="grid grid-cols-2 gap-16 px-10">
                                        <div className="text-center">
                                            <div className="border-t border-slate-300 w-full mb-3"></div>
                                            <p className="text-xs font-bold text-slate-800">{tenant?.company_name || 'Assinatura Oficial'}</p>
                                            <p className="text-[10px] text-slate-400 uppercase tracking-widest mt-1">EMISSOR</p>
                                        </div>
                                        <div className="text-center">
                                            <div className="border-t border-slate-300 w-full mb-3"></div>
                                            <p className="text-xs font-bold text-slate-800 capitalize">{printItem.customerName?.toLowerCase()}</p>
                                            <p className="text-[10px] text-slate-400 uppercase tracking-widest mt-1">CLIENTE (DE ACORDO)</p>
                                        </div>
                                    </div>
                                </div>
                                
                                {/* Footer Minimalista SaaS */}
                                <div className="mt-12 pt-4 border-t border-slate-100 flex justify-between items-center text-[9px] text-slate-400 font-medium">
                                    <p>Recibo gerado eletronicamente e válido digitalmente.</p>
                                    <p>Powered by Nexus Pro OS System</p>
                                </div>

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
