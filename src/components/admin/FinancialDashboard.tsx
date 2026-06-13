import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useI18n } from '../../i18n';
import { useDialog } from '../../contexts/DialogContext';
import { flushSync } from 'react-dom';
import { ServiceOrder, OrderStatus, User, Quote, Customer } from '../../types';
import type { DbTenant } from '../../types/database';
import {
    Search, X, DollarSign, Calendar, Users, Tag,
    CreditCard, ArrowRight, CheckCircle2, FileText, Printer, ShieldCheck, MapPin,
    Layout as Layer, Info, UserCheck, Wallet, Smartphone, Layers, Wrench, Check, ArrowUpRight,
    TrendingUp, Clock, FileSpreadsheet, ChevronRight, ChevronDown, Plus, Slash, ArrowUp, ArrowDown, ArrowUpDown, Filter, Loader2, Share2, Hexagon, Paperclip, Image as ImageIcon, RefreshCw
} from 'lucide-react';
import { Pagination } from '../ui/Pagination';
import { NexusBranding } from '../ui/NexusBranding';
import { DataService } from '../../services/dataService';
import { StorageService } from '../../services/storageService';
import XLSX from 'xlsx-js-style';
import { NexusQueryClient } from '../../hooks/nexusHooks';
import { usePermissions } from '../../hooks/usePermissions';

interface FinancialDashboardProps {
    orders: ServiceOrder[];
    quotes: Quote[];
    techs: User[];
    customers?: Customer[];
    tenant?: DbTenant | null;
    onRefresh: () => Promise<void>;
}

export const FinancialDashboard: React.FC<FinancialDashboardProps> = ({ orders, quotes, techs, customers = [], tenant, onRefresh }) => {
  const { t } = useI18n();
  const { showAlert } = useDialog();
  const { can } = usePermissions();

    const printRef = useRef<HTMLDivElement>(null);
    const [searchTerm, setSearchTerm] = useState('');

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
                showAlert('Atenção: O período selecionado não pode ser maior que 1 ano. A data limite foi ajustada.', 'warning');
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
    const [isTechDropdownOpen, setIsTechDropdownOpen] = useState(false);
    const [techSearchQuery, setTechSearchQuery] = useState('');
    const techDropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (techDropdownRef.current && !techDropdownRef.current.contains(event.target as Node)) {
                setIsTechDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const [dateFilterType, setDateFilterType] = useState<'createdAt' | 'paidAt' | 'dueDate'>('dueDate');
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [selectedItem, setSelectedItem] = useState<any | null>(null);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [showFilters, setShowFilters] = useState(false);
    const [detailTab, setDetailTab] = useState<'overview' | 'financial' | 'linked' | 'attachments'>('overview');
    const [printWithAttachment, setPrintWithAttachment] = useState(false);
    const [showAttachmentConfirmModal, setShowAttachmentConfirmModal] = useState(false);
    const [pendingPrintItem, setPendingPrintItem] = useState<any | null>(null);

    // Form de Baixa
    const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
    const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
    const [printItem, setPrintItem] = useState<any | null>(null);
    const [paymentMethod, setPaymentMethod] = useState('Dinheiro');
    const [installments, setInstallments] = useState(2);
    const [billingNotes, setBillingNotes] = useState('');
    const [receiptFile, setReceiptFile] = useState<File | null>(null);
    const [billingDiscount, setBillingDiscount] = useState(0);
    const [billingDiscountType, setBillingDiscountType] = useState<'fixed' | 'percent'>('fixed');
    const [isProcessing, setIsProcessing] = useState(false);
    const [editingDueDate, setEditingDueDate] = useState<string>('');

    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 12;

    const [isRefreshing, setIsRefreshing] = useState(false);

    const handleRefresh = async () => {
        setIsRefreshing(true);
        try { await onRefresh(); } finally { setIsRefreshing(false); }
    };

    // Removido o useEffect que chamava window.print() automaticamente,
    // pois causava conflito com o executePrint e abria duas telas de impressão.
    // Agora a impressão é controlada exclusivamente pela função executePrint.

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
            showAlert('Erro ao vincular orçamento.', 'error');
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
                dueDate: q.approvedAt || q.validUntil || (q as any).updatedAt || q.createdAt,
                createdAt: q.createdAt,
                updatedAt: (q as any).updatedAt || q.createdAt,
                paidAt: q.paidAt || null,
                value: Number(q.totalValue) || 0,
                status: (q.billingStatus || 'PENDING').toUpperCase(),
                original: q,
                billingDiscount: q.discount || 0,
                billingDiscountType: q.discountType || 'fixed',
                technician: techs.find(t => t.id === (q as any).createdBy || t.id === (q as any).authorId)?.name || 'Administrador'
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
                    dueDate: order.scheduledDate || order.updatedAt,
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
            let targetDate = item.dueDate || item.date;
            if (dateFilterType === 'createdAt') targetDate = item.createdAt;
            if (dateFilterType === 'paidAt') targetDate = item.paidAt;

            let itemDate = '';
            if (targetDate) {
                itemDate = new Date(targetDate).toISOString().split('T')[0];
            }

            const matchesSearch =
                item.customerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                item.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                item.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                item.displayId?.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesTech = techFilter === 'ALL' || item.technician === techFilter;
            const matchesStatus = statusFilter === 'ALL' || item.status === statusFilter;
            const matchesDate =
                (!startDate && !endDate) || 
                (targetDate && (!startDate || itemDate >= startDate) && (!endDate || itemDate <= endDate));
            return matchesSearch && matchesTech && matchesStatus && matchesDate;
        });
    }, [allItems, searchTerm, startDate, endDate, techFilter, statusFilter, dateFilterType]);

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
        
        let uploadedReceiptUrl = '';
        if (receiptFile) {
            try {
                const folderId = selectedIds[0] || Date.now().toString();
                uploadedReceiptUrl = await StorageService.uploadBlob(receiptFile, `financial/receipts/${folderId}`);
            } catch (err) {
                console.error("[FinancialDashboard] Error uploading receipt:", err);
            }
        }
        
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
                        receiptUrl: uploadedReceiptUrl || item.original?.receiptUrl,
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
                                receiptUrl: uploadedReceiptUrl || qOrigin.receiptUrl,
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
                        receiptUrl: uploadedReceiptUrl || item.original?.receiptUrl,
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
                    original: { ...prev.original, billingStatus: 'PAID', paymentMethod: finalMethod, paidAt, discount: billingDiscount, discountType: billingDiscountType, receiptUrl: uploadedReceiptUrl || prev.original?.receiptUrl }
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
            showAlert(`Erro ao processar faturamento: ${error.message}`, 'error');
        } finally {
            setIsProcessing(false);
        }
    };

    // ── Handler de Impressão ──────────────────────────────────────────────────
    const handlePrint = (item: any) => {
        if (item.original?.receiptUrl) {
            // Mostra popup visual para escolha
            setPendingPrintItem(item);
            setShowAttachmentConfirmModal(true);
        } else {
            // Garante que o componente seja renderizado antes de imprimir
            flushSync(() => {
                setPrintWithAttachment(false);
                setPrintItem(item);
                setIsPrintModalOpen(true);
            });
            executePrint(false);
        }
    };

    const executePrint = (includeAttachment = false) => {
        const container = document.getElementById('print-container');
        if (!container) { window.print(); return; }

        const printWindow = window.open('', '_blank', 'width=900,height=700');
        if (!printWindow) {
            showAlert('Por favor, permita pop-ups neste site para imprimir.', 'warning');
            return;
        }

        const styleLinks = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
            .map(el => el.outerHTML)
            .join('\n');

        printWindow.document.write(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="utf-8">
    <title>Recibo de Faturamento</title>
    ${styleLinks}
    <style>
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        body { margin: 0 !important; padding: 0 !important; background: white; }
        /* Remove altura mínima artificial para evitar páginas em branco */
        #printable-receipt { min-height: unset !important; }
        /* Força quebra de página SOMENTE quando há comprovante na 2ª página */
        ${includeAttachment ? '#printable-receipt { page-break-after: always !important; break-after: page !important; }' : ''}
        .print\\:hidden { display: none !important; }
        @media print {
            @page { margin: 10mm; }
            body { margin: 0; padding: 0; }
            #printable-receipt { min-height: unset !important; }
            ${includeAttachment ? '#printable-receipt { page-break-after: always !important; break-after: page !important; }' : ''}
        }
    </style>
</head>
<body>
${container.innerHTML}
</body>
</html>`);

        printWindow.document.close();

        const doPrint = () => {
            printWindow.focus();
            printWindow.print();
            setTimeout(() => { 
                if (!printWindow.closed) printWindow.close(); 
                setIsPrintModalOpen(false);
                setPrintItem(null);
            }, 1000);
        };

        if (printWindow.document.readyState === 'complete') {
            setTimeout(doPrint, 300);
        } else {
            printWindow.onload = () => setTimeout(doPrint, 300);
            setTimeout(doPrint, 2500);
        }
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

    const getItemNetValue = (item: any) => {
        if (!item) return 0;
        const subtotal = item.original?.items?.reduce((a: number, i: any) => a + (Number(i.total) || 0), 0) || item.value;
        const disc = Number(item.original?.discount) || 0;
        const infer = subtotal > item.original?.totalValue ? subtotal - item.original?.totalValue : 0;
        const finalDisc = disc > 0 ? disc : infer;
        const type = disc > 0 ? (item.original?.discountType || 'fixed') : 'fixed';
        
        const discountAmount = type === 'percent' ? (subtotal * finalDisc / 100) : finalDisc;
        return Math.max(0, subtotal - discountAmount);
    };

    const renderInstallmentsDetails = (item: any) => {
        if (!item?.original?.paymentMethod) return null;
        const match = item.original.paymentMethod.match(/(\d+)x$/i);
        if (!match) return null;
        const numInstallments = parseInt(match[1], 10);
        if (numInstallments <= 1) return null;
        const netValue = getItemNetValue(item);
        return ` (${numInstallments}x de ${formatCurrency(netValue / numInstallments)})`;
    };

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
        <div className="p-4 flex flex-col h-full bg-slate-50/20 overflow-hidden relative font-sans">

            {/* ── FILTROS + STATS ── */}
            <div className="flex-shrink-0 space-y-2.5 mb-2.5">
                {/* Row 1: Search & Toggle & Export */}
                <div className="flex flex-col xl:flex-row gap-2.5 items-center w-full">
                    <div className="flex w-full xl:w-auto flex-1 gap-2.5">
                        <div className="relative flex-1 group">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#1c2d4f] transition-colors" size={14} />
                            <input
                                type="text"
                                placeholder="Pesquisar por cliente, protocolo ou ORC..."
                                className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-4 py-1.5 h-9 text-xs font-medium text-slate-700 outline-none focus:ring-2 focus:ring-[#1c2d4f]/10 transition-all shadow-sm"
                                value={searchTerm}
                                onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                            />
                        </div>
                        <button
                            onClick={() => setShowFilters(!showFilters)}
                            className={`flex items-center gap-2 px-3 h-9 rounded-lg border transition-all text-[10px] font-medium ${showFilters ? 'bg-slate-800 border-slate-800 text-slate-200 shadow-inner' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50 shadow-sm'}`}
                        >
                            <Filter size={14} /> {showFilters ? 'Filtros (On)' : 'Filtros'}
                        </button>
                    </div>

                    <div className="flex items-center gap-2.5 ml-auto w-full xl:w-auto justify-end">
                        <button
                            onClick={handleRefresh}
                            disabled={isRefreshing}
                            className="group h-9 px-3 flex items-center justify-center gap-2 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-slate-500 hover:text-primary-600 shadow-sm transition-all active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
                            title="Atualizar dados financeiros"
                        >
                            {isRefreshing
                                ? <Loader2 size={16} className="animate-spin text-primary-500" />
                                : <RefreshCw size={16} className="group-hover:rotate-180 transition-transform duration-500" />}
                            {isRefreshing && <span className="text-[10px] font-medium text-primary-500">Atualizando...</span>}
                        </button>


                        {/* Ações em Lote (Seleção) - Realocado para o Header */}
                        {selectedIds.length > 0 && (
                            <div className="flex items-center gap-3 px-3 py-1 bg-slate-900 rounded-xl shadow-2xl animate-in fade-in slide-in-from-right-4 ring-4 ring-slate-100/50 h-9">
                                <div className="flex flex-col pr-3 border-r border-slate-700 justify-center">
                                    <span className="text-[9px] font-semibold text-slate-400 uppercase leading-none mb-0.5">Sel.</span>
                                    <span className="text-xs font-semibold text-white leading-none tracking-wider">{selectedIds.length}</span>
                                </div>
                                <div className="flex flex-col pr-3 border-r border-slate-700 justify-center">
                                    <span className="text-[9px] font-semibold text-emerald-500 uppercase leading-none mb-0.5">Total</span>
                                    <span className="text-[11px] font-semibold text-emerald-400 leading-none tracking-wide">{formatCurrency(selectedTotal)}</span>
                                </div>

                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={handleExportExcel}
                                        className="flex items-center gap-2 px-2.5 py-1 bg-emerald-500 hover:bg-emerald-400 text-white rounded-md text-[10px] font-semibold uppercase transition-all shadow-lg shadow-emerald-500/20 active:scale-95 whitespace-nowrap"
                                        title="Exportar Seleção para Excel"
                                    >
                                        <FileSpreadsheet size={13} /> Excel
                                    </button>

                                    <button
                                        onClick={() => {
                                            if (can('financial', 'invoice')) handleInvoiceBatch();
                                            else showAlert("Acesso Negado: Você não tem permissão para faturar.", 'warning');
                                        }}
                                        className={`flex items-center gap-2 px-2.5 py-1 text-white rounded-md text-[10px] font-semibold uppercase transition-all whitespace-nowrap ${can('financial', 'invoice') ? 'bg-slate-800 hover:bg-slate-800 shadow-lg shadow-slate-800/20 active:scale-95' : 'bg-slate-800/30 text-white/50 grayscale cursor-not-allowed'}`}
                                        title="Faturar Seleção"
                                    >
                                        <DollarSign size={13} /> Faturar
                                    </button>

                                    <div className="w-px h-4 bg-slate-700 mx-0.5" />

                                    <button
                                        onClick={() => setSelectedIds([])}
                                        className="p-1 text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 rounded-md transition-all ring-1 ring-transparent hover:ring-rose-200"
                                        title="Limpar Seleção"
                                    >
                                        <X size={14} />
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Collapsible Filters */}
                {showFilters && (
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 p-3 bg-slate-50/50 rounded-xl border border-dashed border-slate-200 animate-in fade-in slide-in-from-top-2 duration-200">
                        <div className="md:col-span-4 flex flex-col gap-1">
                            <label className="text-[9px] font-medium text-slate-400 uppercase tracking-widest px-1">Filtro de Data</label>
                            <div className="flex bg-white border border-slate-200 rounded-lg shadow-sm items-center h-8 relative">
                                <select 
                                    value={dateFilterType}
                                    onChange={e => setDateFilterType(e.target.value as any)}
                                    className="bg-transparent border-none text-[9px] font-medium uppercase text-slate-500 outline-none cursor-pointer pl-2 pr-1 h-full max-w-[90px] min-w-[80px]"
                                >
                                    <option value="dueDate">Vencimento</option>
                                    <option value="createdAt">Criação</option>
                                    <option value="paidAt">Faturamento</option>
                                </select>
                                <div className="h-4 w-px bg-slate-200 shrink-0" />
                                <div className="flex px-2 items-center w-full gap-1">
                                    <Calendar size={12} className="text-slate-400 shrink-0" />
                                    <input type="date" value={startDate} onChange={e => handleDateValidation(e.target.value, endDate)} className="bg-transparent border-none text-[10px] font-medium uppercase text-slate-600 outline-none cursor-pointer w-full py-1 h-full" />
                                    <Slash size={10} className="text-slate-300 shrink-0 mx-0.5" />
                                    <input type="date" value={endDate} onChange={e => handleDateValidation(startDate, e.target.value)} className="bg-transparent border-none text-[10px] font-medium uppercase text-slate-600 outline-none cursor-pointer w-full py-1 h-full" />
                                </div>
                            </div>
                        </div>
                        <div className="md:col-span-4 flex flex-col gap-1">
                            <label className="text-[9px] font-medium text-slate-400 uppercase tracking-widest px-1">Técnico / Responsável</label>
                            <div className="relative w-full h-8" ref={techDropdownRef}>
                                <div 
                                    className="w-full bg-white border border-slate-200 rounded-lg pl-8 pr-6 text-[10px] font-medium text-slate-700 cursor-pointer shadow-sm flex items-center h-full outline-none transition-all relative"
                                    onClick={() => setIsTechDropdownOpen(!isTechDropdownOpen)}
                                >
                                    <UserCheck size={12} className="absolute left-2.5 text-[#1c2d4f] shrink-0" />
                                    <span className="truncate uppercase">
                                        {techFilter === 'ALL' ? 'Técnicos (Todos)' : techFilter}
                                    </span>
                                    <ChevronDown size={14} className={`absolute right-2 text-slate-400 transition-transform ${isTechDropdownOpen ? 'rotate-180' : ''}`} />
                                </div>

                                {isTechDropdownOpen && (
                                    <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden z-[100] animate-in fade-in slide-in-from-top-2">
                                        <div className="p-2 border-b border-slate-100 bg-slate-50/50">
                                            <div className="relative">
                                                <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                                                <input 
                                                    type="text" 
                                                    placeholder="Buscar técnico..." 
                                                    className="w-full bg-white border border-slate-200 rounded-lg pl-7 pr-2 py-1 text-[10px] font-medium outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-500/20"
                                                    value={techSearchQuery}
                                                    onChange={e => setTechSearchQuery(e.target.value)}
                                                    onClick={e => e.stopPropagation()}
                                                    autoFocus
                                                />
                                            </div>
                                        </div>
                                        <div className="max-h-48 overflow-y-auto custom-scrollbar">
                                            <div 
                                                className={`px-3 py-2 cursor-pointer text-[10px] font-medium uppercase hover:bg-slate-50 transition-colors ${techFilter === 'ALL' ? 'bg-primary-50 text-primary-700' : 'text-slate-700'}`}
                                                onClick={() => { setTechFilter('ALL'); setCurrentPage(1); setIsTechDropdownOpen(false); setTechSearchQuery(''); }}
                                            >
                                                Técnicos (Todos)
                                            </div>
                                            {techs.filter(t => t.name.toLowerCase().includes(techSearchQuery.toLowerCase())).map(t => (
                                                <div 
                                                    key={t.id} 
                                                    className={`px-3 py-2 cursor-pointer text-[10px] font-medium uppercase transition-colors border-t border-slate-50 truncate ${techFilter === t.name ? 'bg-primary-50 text-primary-700' : 'hover:bg-slate-50 text-slate-700'}`}
                                                    onClick={() => { setTechFilter(t.name); setCurrentPage(1); setIsTechDropdownOpen(false); setTechSearchQuery(''); }}
                                                >
                                                    {t.name}
                                                </div>
                                            ))}
                                            {'administrador'.includes(techSearchQuery.toLowerCase()) && (
                                                <div 
                                                    className={`px-3 py-2 cursor-pointer text-[10px] font-medium uppercase transition-colors border-t border-slate-50 truncate ${techFilter === 'Administrador' ? 'bg-primary-50 text-primary-700' : 'hover:bg-slate-50 text-slate-700'}`}
                                                    onClick={() => { setTechFilter('Administrador'); setCurrentPage(1); setIsTechDropdownOpen(false); setTechSearchQuery(''); }}
                                                >
                                                    Administrador (Admin)
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="md:col-span-3 flex flex-col gap-1">
                            <label className="text-[9px] font-medium text-slate-400 uppercase tracking-widest px-1">Estado do Lançamento</label>
                            <div className="flex bg-white border border-slate-200 rounded-lg shadow-sm h-8 p-0.5 gap-0.5">
                                {[
                                    { value: 'ALL', label: 'Todos' },
                                    { value: 'PENDING', label: 'Pendente' },
                                    { value: 'PAID', label: 'Faturado' },
                                ].map(opt => (
                                    <button
                                        key={opt.value}
                                        onClick={() => { setStatusFilter(opt.value); setCurrentPage(1); }}
                                        className={`flex-1 rounded-md text-[9px] font-medium uppercase tracking-wide transition-all ${
                                            statusFilter === opt.value
                                                ? opt.value === 'PENDING'
                                                    ? 'bg-amber-500 text-white shadow-sm'
                                                    : opt.value === 'PAID'
                                                        ? 'bg-emerald-500 text-white shadow-sm'
                                                        : 'bg-slate-800 text-white shadow-sm'
                                                : 'text-slate-500 hover:bg-slate-50'
                                        }`}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {(techFilter !== 'ALL' || statusFilter !== 'ALL') && (
                            <div className="md:col-span-1 flex flex-col justify-end">
                                <button
                                    onClick={() => { setTechFilter('ALL'); setStatusFilter('ALL'); setCurrentPage(1); }}
                                    className="h-8 px-3 bg-rose-50 hover:bg-rose-500 hover:text-white text-rose-500 rounded-lg transition-all shadow-sm flex items-center justify-center border border-rose-100"
                                    title="Limpar Filtros"
                                >
                                    <X size={14} />
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* Stats Cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
                    {[
                        { label: 'Total Recebido', value: formatCurrency(stats.totalFaturado), icon: <DollarSign size={16} />, color: 'from-emerald-500 to-emerald-600', textMain: 'text-white' },
                        { label: 'A Receber', value: formatCurrency(stats.totalPendente), icon: <Clock size={16} />, color: 'from-amber-500 to-amber-600', textMain: 'text-white' },
                        { label: 'Ticket Médio', value: formatCurrency(filteredItems.length > 0 ? (stats.totalFaturado + stats.totalPendente) / filteredItems.length : 0), icon: <TrendingUp size={16} />, color: 'from-[#1c2d4f] to-[#2a457a]', textMain: 'text-white' },
                        { label: 'Top Faturador', value: stats.topTech[0]?.toString() || '—', icon: <UserCheck size={16} />, color: 'from-slate-700 to-slate-900', textMain: 'text-white', truncate: true },
                    ].map((stat, i) => (
                        <div key={i} className={`bg-gradient-to-br ${stat.color} rounded-xl px-3.5 py-2.5 shadow-md flex items-center gap-3`}>
                            <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center text-white shrink-0">
                                {stat.icon}
                            </div>
                            <div className="min-w-0">
                                <p className="text-[9px] font-semibold text-white/70 uppercase tracking-widest leading-none mb-1">{stat.label}</p>
                                <p className={`text-[13px] font-semibold ${stat.textMain} leading-none ${stat.truncate ? 'truncate' : ''}`}>{stat.value}</p>
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
                            <tr className="text-[12px] font-semibold text-slate-600 tracking-tight text-center">
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
                                    <div className="flex items-center">Data Ref. {getSortIcon('date')}</div>
                                </th>
                                <th className="px-4 py-3 cursor-pointer group select-none hover:bg-slate-50 transition-colors" onClick={() => requestSort('dueDate')}>
                                    <div className="flex items-center">Vencimento {getSortIcon('dueDate')}</div>
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
                            {isRefreshing ? (
                                <tr>
                                    <td colSpan={10} className="py-16 text-center">
                                        <div className="flex flex-col items-center gap-3">
                                            <Loader2 size={28} className="animate-spin text-primary-400" />
                                            <p className="text-xs font-medium text-slate-400">Carregando dados financeiros...</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : paginatedItems.length === 0 ? (
                                <tr>
                                    <td colSpan={10} className="py-16 text-center">
                                        <DollarSign size={32} className="text-slate-200 mx-auto mb-3" />
                                        <p className="text-xs font-semibold text-slate-300 uppercase tracking-widest">Nenhum lançamento encontrado</p>
                                    </td>
                                </tr>
                            ) : paginatedItems.map(item => (
                                <tr
                                    key={item.id}
                                    className={`group hover:bg-[#1c2d4f]/5 transition-all cursor-pointer ${selectedIds.includes(item.id) ? 'bg-[#1c2d4f]/5' : 'bg-white'}`}
                                    onClick={() => { setDetailTab('overview'); setSelectedItem(item); setEditingDueDate(''); setIsSidebarOpen(true); }}
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
                                            <span className="text-[12px] font-medium text-rose-600 whitespace-nowrap">
                                                {new Date(item.dueDate || item.date).toLocaleDateString('pt-BR')}
                                            </span>
                                            <span className="text-[10px] text-rose-400 tracking-wider">Prazo</span>
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
                                                <span className="text-[9px] text-rose-500 font-medium uppercase tracking-widest mt-0.5">
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



            {/* ── PAINEL DE DETALHES — Idêntico à edição de OS ── */}
            {isSidebarOpen && selectedItem && (
                <div
                    className="fixed inset-0 z-[1200] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-0 lg:p-4 animate-in fade-in"
                    onClick={() => setIsSidebarOpen(false)}
                >
                    <div
                        className="bg-white rounded-none lg:rounded-xl w-full max-w-6xl h-full lg:h-auto lg:max-h-[92vh] shadow-2xl flex flex-col overflow-hidden border-0 lg:border border-slate-200"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* HEADER — igual ao da OS */}
                        <div className="px-3 sm:px-6 py-3 sm:py-5 border-b border-slate-100 flex justify-between items-start sm:items-center shrink-0 bg-white">
                            <div className="flex items-start sm:items-center gap-2 sm:gap-4 min-w-0 flex-1">
                                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center border bg-slate-50 border-slate-200 text-slate-400 shrink-0">
                                    {selectedItem.type === 'QUOTE' ? <FileText size={18} /> : <Wrench size={18} />}
                                </div>
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-3">
                                        <h2 className="text-sm sm:text-base font-semibold text-slate-900 font-poppins truncate">
                                            {selectedItem.type === 'QUOTE' ? 'Orçamento' : 'Ordem de Serviço'} #{getDocLabel(selectedItem)}
                                        </h2>
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-widest border ${selectedItem.status === 'PAID' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-amber-50 text-amber-600 border-amber-200'}`}>
                                            {selectedItem.status === 'PAID' ? 'Faturado' : 'Pendente'}
                                        </span>
                                    </div>
                                    <p className="text-[10px] sm:text-xs text-slate-500 font-medium mt-0.5 truncate">
                                        {selectedItem.customerName} • {selectedItem.title || (selectedItem.type === 'QUOTE' ? 'Orçamento' : 'Ordem de Serviço')}
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                                <button
                                    onClick={() => {
                                        const route = selectedItem.type === 'QUOTE' ? 'view-quote' : 'order/view';
                                        const token = selectedItem.original?.publicToken || selectedItem.id;
                                        window.open(`${window.location.origin}/#/${route}/${token}`, '_blank');
                                    }}
                                    className="h-9 px-2 sm:px-4 gap-1.5 border border-primary-200 text-primary-700 hover:bg-primary-50 rounded-lg text-xs font-medium transition-all flex items-center"
                                >
                                    <Share2 size={14} /> <span className="hidden sm:inline">Visualizar</span>
                                </button>
                                <button
                                    onClick={() => handlePrint(selectedItem)}
                                    className="h-9 px-2 sm:px-4 gap-1.5 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg text-xs font-medium transition-all flex items-center"
                                >
                                    <Printer size={14} /> <span className="hidden sm:inline">Imprimir</span>
                                </button>
                                {selectedItem.status !== 'PAID' && (
                                    <button
                                        onClick={() => {
                                            if (can('financial', 'invoice')) {
                                                setSelectedIds([selectedItem.id]);
                                                setIsInvoiceModalOpen(true);
                                            } else {
                                                showAlert("Acesso Negado: Você não tem permissão para faturar.", 'warning');
                                            }
                                        }}
                                        className={`h-9 px-2 sm:px-4 gap-1.5 rounded-lg text-xs font-medium transition-all flex items-center shadow-md ${can('financial', 'invoice') ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20' : 'bg-slate-100 text-slate-400 cursor-not-allowed opacity-50'}`}
                                    >
                                        <DollarSign size={14} /> <span className="hidden md:inline">Faturar</span>
                                    </button>
                                )}
                                <div className="h-6 w-px bg-slate-200 mx-0.5 sm:mx-2" />
                                <button onClick={() => setIsSidebarOpen(false)} className="p-2 text-slate-400 hover:text-slate-900 transition-all">
                                    <X size={20} />
                                </button>
                            </div>
                        </div>

                        {/* BODY — sidebar tabs + conteúdo */}
                        <div className="flex flex-col md:flex-row flex-1 overflow-hidden">

                            {/* DESKTOP SIDEBAR TABS */}
                            <div className="hidden md:flex flex-col w-48 border-r border-slate-200 bg-slate-50/80 p-3 gap-1 overflow-y-auto custom-scrollbar shrink-0">
                                <div className="text-[9px] font-semibold text-slate-400 uppercase tracking-widest mb-2 px-2">Navegação</div>
                                {[
                                    { id: 'overview', label: 'Visão Geral', icon: Info },
                                    { id: 'financial', label: 'Financeiro', icon: DollarSign },
                                    { id: 'linked', label: selectedItem.type === 'ORDER' ? 'Vínculos' : 'Detalhes', icon: Layer },
                                    { id: 'attachments', label: 'Anexos', icon: Paperclip },
                                ].map(tab => (
                                    <button
                                        key={tab.id}
                                        onClick={() => setDetailTab(tab.id as any)}
                                        className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-medium transition-all w-full text-left font-poppins
                                            ${detailTab === tab.id
                                                ? 'bg-[#1c2d4f] text-white shadow-md ring-1 ring-[#1c2d4f]'
                                                : 'text-slate-500 hover:bg-white hover:text-[#1c2d4f] hover:shadow-sm'}`}
                                    >
                                        <tab.icon size={15} className={detailTab === tab.id ? 'text-white' : 'text-slate-400 shrink-0'} />
                                        <span className="flex-1 truncate">{tab.label}</span>
                                    </button>
                                ))}
                            </div>

                            {/* MOBILE TABS */}
                            <div className="md:hidden border-b border-slate-200 bg-white p-3 flex gap-2 overflow-x-auto custom-scrollbar shrink-0">
                                {[
                                    { id: 'overview', label: 'Visão Geral', icon: Info },
                                    { id: 'financial', label: 'Financeiro', icon: DollarSign },
                                    { id: 'linked', label: selectedItem.type === 'ORDER' ? 'Vínculos' : 'Detalhes', icon: Layer },
                                    { id: 'attachments', label: 'Anexos', icon: Paperclip },
                                ].map(tab => (
                                    <button
                                        key={tab.id}
                                        onClick={() => setDetailTab(tab.id as any)}
                                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-medium transition-all whitespace-nowrap font-poppins
                                            ${detailTab === tab.id
                                                ? 'bg-[#1c2d4f] text-white shadow-md'
                                                : 'bg-slate-50 text-slate-500 border border-slate-200'}`}
                                    >
                                        <tab.icon size={14} className={detailTab === tab.id ? 'text-white' : 'text-slate-400'} />
                                        {tab.label}
                                    </button>
                                ))}
                            </div>

                            {/* CONTEÚDO DA ABA */}
                            <div className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar">

                                {detailTab === 'overview' && (
                                    <div className="space-y-4">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {/* Cliente */}
                                            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                                                <div className="flex items-center gap-2 pb-3 border-b border-slate-100 mb-3">
                                                    <div className="w-7 h-7 rounded-lg bg-slate-50 flex items-center justify-center border border-slate-200 text-slate-500"><Users size={13} /></div>
                                                    <h3 className="text-xs font-semibold text-slate-800 tracking-wide">Dados do Cliente</h3>
                                                </div>
                                                <p className="text-sm font-medium text-slate-800">{selectedItem.customerName}</p>
                                                {(() => {
                                                    const fullCust = customers.find(c => c.name?.toLowerCase().trim() === selectedItem.customerName?.toLowerCase().trim());
                                                    let address = selectedItem.customerAddress;
                                                    if (!address || address.trim() === '') {
                                                        if (fullCust && fullCust.street) {
                                                            address = `${fullCust.street}, ${fullCust.number || 'S/N'} - ${fullCust.neighborhood || ''} - ${fullCust.city || ''}`;
                                                        }
                                                    }
                                                    return (
                                                        <>
                                                            {address && address.length > 5 && (
                                                                <div className="flex items-start gap-1.5 mt-2">
                                                                    <MapPin size={11} className="text-slate-400 mt-0.5 shrink-0" />
                                                                    <p className="text-[11px] text-slate-500 font-medium">{address}</p>
                                                                </div>
                                                            )}
                                                            {fullCust && (
                                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3 pt-3 border-t border-slate-50">
                                                                    {(fullCust.phone || fullCust.whatsapp) && (
                                                                        <div>
                                                                            <p className="text-[9px] font-medium text-slate-400 uppercase tracking-widest">Telefone / Whats</p>
                                                                            <p className="text-[11px] font-medium text-slate-700">{fullCust.whatsapp || fullCust.phone}</p>
                                                                        </div>
                                                                    )}
                                                                    {fullCust.email && (
                                                                        <div>
                                                                            <p className="text-[9px] font-medium text-slate-400 uppercase tracking-widest">{t.common.email}</p>
                                                                            <p className="text-[11px] font-medium text-slate-700 truncate" title={fullCust.email}>{fullCust.email}</p>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </>
                                                    );
                                                })()}
                                            </div>

                                            {/* Técnico + Descrição */}
                                            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                                                <div className="flex items-center gap-2 pb-3 border-b border-slate-100 mb-3">
                                                    <div className="w-7 h-7 rounded-lg bg-slate-50 flex items-center justify-center border border-slate-200 text-slate-500"><Info size={13} /></div>
                                                    <h3 className="text-xs font-semibold text-slate-800 tracking-wide">Contexto e Detalhes</h3>
                                                </div>
                                                <div className="flex items-center gap-3 mb-4 p-3 bg-slate-50 border border-slate-100 rounded-xl">
                                                    <div className="w-8 h-8 bg-white border border-slate-200 rounded-lg flex items-center justify-center shrink-0">
                                                        <UserCheck size={14} className="text-slate-500" />
                                                    </div>
                                                    <div>
                                                        <p className="text-[9px] font-medium text-slate-400 uppercase tracking-widest">Usuário / Responsável</p>
                                                        <p className="text-xs font-medium text-slate-700">{selectedItem.technician || '—'}</p>
                                                    </div>
                                                </div>
                                                <div className="bg-slate-50/50 rounded-lg p-3 border border-slate-100 space-y-3">
                                                    <div>
                                                        <p className="text-[9px] font-medium text-slate-400 uppercase tracking-widest mb-0.5">Referência Original</p>
                                                        <p className="text-xs font-medium text-slate-700">{selectedItem.type === 'QUOTE' ? 'Orçamento Aprovado' : 'Ordem de Serviço Concluída'}</p>
                                                    </div>
                                                    <div className="h-px bg-slate-200" />
                                                    <div>
                                                        <p className="text-[9px] font-medium text-slate-400 uppercase tracking-widest mb-1">Descrição</p>
                                                        {selectedItem.description ? <p className="text-xs text-slate-600 font-medium leading-relaxed">{selectedItem.description}</p> : <p className="text-xs text-slate-400 italic">Nenhuma descrição informada.</p>}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {detailTab === 'financial' && (
                                    <div className="space-y-4">
                                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                                            {getItemNetValue(selectedItem) < selectedItem.value ? (
                                                <>
                                                    <p className="text-[10px] font-medium text-slate-400 uppercase tracking-widest mb-1">Valor Bruto</p>
                                                    <p className="text-xl font-medium tracking-tight text-slate-400 line-through mb-2">
                                                        {formatCurrency(selectedItem.value)}
                                                    </p>
                                                    
                                                    <div className="flex justify-between items-center mb-2">
                                                        <p className="text-[10px] font-semibold text-rose-500 uppercase tracking-widest">Desconto Aplicado</p>
                                                        <p className="text-xs font-medium text-rose-500">
                                                            {selectedItem.original.discountType === 'percent' && selectedItem.original.discount > 0
                                                                ? `- ${selectedItem.original.discount}%`
                                                                : `- ${formatCurrency(selectedItem.value - getItemNetValue(selectedItem))}`}
                                                        </p>
                                                    </div>

                                                    <div className="border-t border-slate-100 pt-2 pb-2">
                                                        <p className="text-[10px] font-medium text-emerald-600 uppercase tracking-widest mb-1">Valor Líquido</p>
                                                        <p className="text-2xl font-semibold tracking-tight text-emerald-600">
                                                            {formatCurrency(getItemNetValue(selectedItem))}
                                                        </p>
                                                    </div>
                                                </>
                                            ) : (
                                                <>
                                                    <p className="text-[10px] font-medium text-slate-400 uppercase tracking-widest mb-1">Valor Total</p>
                                                    <p className="text-2xl font-semibold tracking-tight text-slate-900 border-b border-slate-100 pb-2 mb-2">
                                                        {formatCurrency(selectedItem.value)}
                                                    </p>
                                                </>
                                            )}
                                            <div className="grid grid-cols-2 gap-2 mt-3">
                                                <div className="flex items-start gap-2">
                                                    <div className="w-6 h-6 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-center shrink-0"><Calendar size={12} className="text-slate-400" /></div>
                                                    <div>
                                                        <p className="text-[8px] font-medium text-slate-400 uppercase tracking-widest leading-none">Emissão / Início</p>
                                                        <p className="text-[10px] font-medium text-slate-600 mt-1">{new Date(selectedItem.createdAt || selectedItem.date).toLocaleDateString('pt-BR')}</p>
                                                    </div>
                                                </div>
                                                {selectedItem.paidAt && (
                                                <div className="flex items-start gap-2">
                                                    <div className="w-6 h-6 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-center shrink-0"><Check size={12} className="text-emerald-500" /></div>
                                                    <div>
                                                        <p className="text-[8px] font-medium text-emerald-500 uppercase tracking-widest leading-none">Recebimento</p>
                                                        <p className="text-[10px] font-medium text-emerald-700 mt-1">{new Date(selectedItem.paidAt).toLocaleDateString('pt-BR')}</p>
                                                    </div>
                                                </div>
                                                )}
                                            </div>

                                            {/* ── Edição de Vencimento (somente para pendentes) ── */}
                                            <div className="mt-3 pt-3 border-t border-slate-100">
                                                <div className="flex items-start gap-2">
                                                    <div className={`w-6 h-6 ${selectedItem.status !== 'PAID' ? 'bg-rose-50 border-rose-200' : 'bg-slate-50 border-slate-200'} border rounded-lg flex items-center justify-center shrink-0`}>
                                                        <Clock size={12} className={selectedItem.status !== 'PAID' ? 'text-rose-500' : 'text-slate-400'} />
                                                    </div>
                                                    <div className="flex-1">
                                                        <p className={`text-[8px] font-medium uppercase tracking-widest leading-none mb-1 ${selectedItem.status !== 'PAID' ? 'text-rose-500' : 'text-slate-400'}`}>Vencimento</p>
                                                        {selectedItem.status !== 'PAID' ? (
                                                            <div className="flex items-center gap-2">
                                                                    <input
                                                                        type="date"
                                                                        disabled={!can('financial', 'update')}
                                                                        value={editingDueDate || (() => {
                                                                        const raw = selectedItem.dueDate || selectedItem.date;
                                                                        if (!raw) return '';
                                                                        try { return new Date(raw).toISOString().split('T')[0]; } catch { return ''; }
                                                                    })()}
                                                                    onChange={(e) => setEditingDueDate(e.target.value)}
                                                                    className="bg-white border border-rose-200 rounded-lg px-2 py-1.5 text-[11px] font-medium text-slate-700 outline-none focus:ring-2 focus:ring-rose-200 transition-all cursor-pointer shadow-sm hover:border-rose-300"
                                                                />
                                                                {editingDueDate && (
                                                                    <button
                                                                        disabled={isProcessing || !can('financial', 'update')}
                                                                        onClick={async () => {
                                                                            if (!can('financial', 'update')) {
                                                                                showAlert("Acesso Negado", "warning"); return;
                                                                            }
                                                                            if (!editingDueDate) return;
                                                                            const newDateISO = new Date(editingDueDate + 'T12:00:00').toISOString();
                                                                            setIsProcessing(true);
                                                                            try {
                                                                                if (selectedItem.type === 'QUOTE') {
                                                                                    await DataService.updateQuote({
                                                                                        ...selectedItem.original,
                                                                                        validUntil: newDateISO,
                                                                                        approvedAt: newDateISO,
                                                                                    });
                                                                                } else {
                                                                                    await DataService.updateOrder({
                                                                                        ...selectedItem.original,
                                                                                        scheduledDate: editingDueDate,
                                                                                    });
                                                                                }
                                                                                setSelectedItem((prev: any) => prev ? ({
                                                                                    ...prev,
                                                                                    dueDate: newDateISO,
                                                                                    date: selectedItem.type === 'QUOTE' ? newDateISO : prev.date,
                                                                                    original: {
                                                                                        ...prev.original,
                                                                                        ...(selectedItem.type === 'QUOTE'
                                                                                            ? { validUntil: newDateISO, approvedAt: newDateISO }
                                                                                            : { scheduledDate: editingDueDate }
                                                                                        ),
                                                                                    }
                                                                                }) : null);
                                                                                setEditingDueDate('');
                                                                                await onRefresh();
                                                                            } catch (err: any) {
                                                                                console.error('Erro ao atualizar vencimento:', err);
                                                                                showAlert('Erro ao atualizar data de vencimento.', 'error');
                                                                            } finally {
                                                                                setIsProcessing(false);
                                                                            }
                                                                        }}
                                                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1c2d4f] hover:bg-[#253a66] text-white rounded-lg text-[10px] font-medium uppercase transition-all shadow-md shadow-[#1c2d4f]/20 active:scale-95 whitespace-nowrap disabled:opacity-50"
                                                                    >
                                                                        {isProcessing ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                                                                        Salvar
                                                                    </button>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <p className="text-[10px] font-medium text-slate-600">{new Date(selectedItem.dueDate || selectedItem.date).toLocaleDateString('pt-BR')}</p>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            
                                            {selectedItem.original?.billingNotes && (
                                                <div className="mt-4 bg-slate-50/50 border border-slate-100 rounded-lg p-3">
                                                    <p className="text-[9px] font-medium text-slate-400 uppercase tracking-widest mb-1">Observações Fiscais/Faturamento</p>
                                                    <p className="text-xs text-slate-700 font-medium leading-relaxed">{selectedItem.original.billingNotes}</p>
                                                </div>
                                            )}
                                        </div>
                                        {selectedItem.status === 'PAID' ? (
                                            <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-5">
                                                <div className="flex items-center gap-3 mb-4">
                                                    <div className="w-8 h-8 bg-emerald-500 rounded-xl flex items-center justify-center"><Check size={16} className="text-white" /></div>
                                                    <p className="text-[11px] font-semibold text-emerald-800 uppercase tracking-widest">Baixa Realizada</p>
                                                </div>
                                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                                    <div className="bg-white rounded-xl p-3 border border-emerald-100">
                                                        <p className="text-[9px] font-semibold text-emerald-500 uppercase mb-1">Forma de Pagamento</p>
                                                        <p className="text-xs font-semibold text-emerald-900 uppercase">
                                                            {selectedItem.original?.paymentMethod || '—'}
                                                            {renderInstallmentsDetails(selectedItem)}
                                                        </p>
                                                    </div>
                                                    <div className="bg-white rounded-xl p-3 border border-emerald-100">
                                                        <p className="text-[9px] font-semibold text-emerald-500 uppercase mb-1">Desconto</p>
                                                        <p className="text-xs font-semibold text-emerald-900 uppercase">
                                                            {(() => {
                                                                const disc = Number(selectedItem.original?.discount) || 0;
                                                                const subtotal = selectedItem.original?.items?.reduce((a: number, i: any) => a + (Number(i.total) || 0), 0) || selectedItem.value;
                                                                const infer = subtotal > selectedItem.original?.totalValue ? subtotal - selectedItem.original?.totalValue : 0;
                                                                const finalDisc = disc > 0 ? disc : infer;
                                                                const type = disc > 0 ? (selectedItem.original?.discountType || 'fixed') : 'fixed';
                                                                if (finalDisc > 0) return type === 'percent' ? `${finalDisc}%` : formatCurrency(finalDisc);
                                                                return 'Sem desconto';
                                                            })()}
                                                        </p>
                                                    </div>
                                                    <div className="bg-white rounded-xl p-3 border border-emerald-100">
                                                        <p className="text-[9px] font-semibold text-emerald-500 uppercase mb-1">Data da Baixa</p>
                                                        <p className="text-xs font-semibold text-emerald-900">{selectedItem.original?.paidAt ? new Date(selectedItem.original.paidAt).toLocaleDateString('pt-BR') : '—'}</p>
                                                    </div>
                                                </div>
                                                {selectedItem.original?.billingNotes && (
                                                    <div className="mt-4 pt-4 border-t border-emerald-100/50 space-y-4">
                                                        <div>
                                                            <p className="text-[9px] font-semibold text-emerald-500 uppercase mb-1">Observações do Faturamento</p>
                                                            <p className="text-xs font-medium text-emerald-800 whitespace-pre-wrap">{selectedItem.original.billingNotes}</p>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="bg-amber-50 border border-amber-100 rounded-xl p-5 text-center space-y-3">
                                                <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center mx-auto">
                                                    <Clock size={20} className="text-amber-500" />
                                                </div>
                                                <p className="text-sm font-medium text-amber-800">Aguardando Faturamento</p>
                                                <p className="text-xs text-amber-600">Valor de {formatCurrency(selectedItem.value)} ainda não liquidado.</p>
                                                <button
                                                    onClick={() => { setSelectedIds([selectedItem.id]); setIsInvoiceModalOpen(true); }}
                                                    className="mx-auto px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-medium text-sm shadow-md transition-all flex items-center gap-2"
                                                >
                                                    <DollarSign size={16} /> Confirmar Lançamento Financeiro
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {detailTab === 'linked' && (
                                    <div className="space-y-4">
                                        {selectedItem.type === 'ORDER' ? (
                                            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                                                <div className="flex items-center gap-2 pb-3 border-b border-slate-100 mb-3">
                                                    <div className="w-7 h-7 rounded-lg bg-slate-50 flex items-center justify-center border border-slate-200 text-slate-500"><Layer size={13} /></div>
                                                    <h3 className="text-xs font-semibold text-slate-800 tracking-wide">Orçamentos Vinculados</h3>
                                                </div>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                    {selectedItem.original?.linkedQuotes?.map((qId: string) => {
                                                        const q = quotes.find(quote => quote.id === qId);
                                                        return q ? (
                                                            <div key={qId} className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex justify-between items-center">
                                                                <div>
                                                                    <span className="text-[9px] font-semibold text-slate-500 uppercase">{q.displayId || 'ORC-' + qId.slice(0, 8).toUpperCase()}</span>
                                                                    <p className="text-xs font-medium text-slate-800 mt-0.5 truncate max-w-[150px]">{q.title}</p>
                                                                </div>
                                                                <span className="text-sm font-semibold text-slate-900">{formatCurrency(q.totalValue)}</span>
                                                            </div>
                                                        ) : null;
                                                    })}
                                                    {(!selectedItem.original?.linkedQuotes || selectedItem.original.linkedQuotes.length === 0) && (
                                                        <div className="col-span-full py-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
                                                            <p className="text-[10px] text-slate-400 font-medium uppercase">Nenhum orçamento vinculado</p>
                                                        </div>
                                                    )}
                                                    {availableQuotesForClient.length > 0 && selectedItem.status !== 'PAID' && (
                                                        <div className="col-span-full pt-3 border-t border-slate-100 mt-2">
                                                            <p className="text-[9px] font-semibold text-slate-400 uppercase mb-2">Disponíveis para vincular:</p>
                                                            <div className="flex flex-wrap gap-2">
                                                                {availableQuotesForClient.map(q => (
                                                                    <button key={q.id} onClick={() => handleLinkQuote(q.id)} disabled={isProcessing} className="px-3 py-2 bg-white border border-slate-200 rounded-xl flex items-center gap-2 hover:border-slate-300 hover:bg-slate-50 transition-all text-[10px] font-medium text-slate-700 uppercase shadow-sm">
                                                                        {q.displayId || 'ORC-' + q.id.slice(0, 8).toUpperCase()} — {formatCurrency(q.totalValue)}
                                                                        <Plus size={12} className="text-slate-400" />
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
                                                <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
                                                    <div className="w-7 h-7 rounded-lg bg-slate-50 flex items-center justify-center border border-slate-200 text-slate-500"><FileText size={13} /></div>
                                                    <h3 className="text-xs font-semibold text-slate-800 tracking-wide">Detalhes do Orçamento</h3>
                                                </div>
                                                {selectedItem.original?.items?.map((item: any, i: number) => (
                                                    <div key={i} className="flex justify-between items-center py-2 border-b border-slate-50 last:border-0">
                                                        <div>
                                                            <p className="text-xs font-medium text-slate-800">{item.description}</p>
                                                            <p className="text-[10px] text-slate-400">{item.quantity} × {formatCurrency(item.unitPrice)}</p>
                                                        </div>
                                                        <span className="text-sm font-semibold text-slate-900">{formatCurrency(item.total)}</span>
                                                    </div>
                                                ))}
                                                {(!selectedItem.original?.items || selectedItem.original.items.length === 0) && (
                                                    <p className="text-xs text-slate-400 text-center py-4">Nenhum item encontrado.</p>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {detailTab === 'attachments' && (
                                    <div className="p-4 sm:p-6 space-y-6 max-w-3xl mx-auto w-full font-poppins animate-in slide-in-from-right-4 duration-300">
                                        <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                                            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
                                                <Paperclip size={20} />
                                            </div>
                                            <div>
                                                <h3 className="text-lg font-semibold text-slate-800">Anexos</h3>
                                                <p className="text-xs font-medium text-slate-500">Documentos e comprovantes vinculados a esta transação.</p>
                                            </div>
                                        </div>

                                        {!selectedItem.original?.receiptUrl ? (
                                            <div className="bg-slate-50 border border-slate-200 border-dashed rounded-xl p-10 flex flex-col items-center justify-center text-center">
                                                <Paperclip size={32} className="text-slate-300 mb-3" />
                                                <p className="text-sm font-medium text-slate-500">Nenhum anexo encontrado</p>
                                                <p className="text-xs text-slate-400 mt-1">Os comprovantes anexados durante o faturamento aparecerão aqui.</p>
                                            </div>
                                        ) : (
                                            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
                                                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                                                    <h4 className="text-sm font-medium text-slate-800">Comprovante de Faturamento</h4>
                                                    <a 
                                                        href={selectedItem.original.receiptUrl} 
                                                        target="_blank" 
                                                        rel="noopener noreferrer"
                                                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium transition-colors"
                                                    >
                                                        Abrir Original
                                                    </a>
                                                </div>
                                                <div className="flex justify-center bg-slate-50 rounded-lg p-2 border border-slate-100">
                                                    {selectedItem.original.receiptUrl.toLowerCase().includes('.pdf') ? (
                                                        <div className="w-full py-12 flex flex-col items-center justify-center text-center">
                                                            <FileText size={48} className="text-slate-300 mb-4" />
                                                            <p className="text-sm font-medium text-slate-600">Documento PDF anexado</p>
                                                            <p className="text-xs text-slate-500 mt-1">Clique em "Abrir Original" para visualizar o arquivo completo.</p>
                                                        </div>
                                                    ) : (
                                                        <img 
                                                            src={selectedItem.original.receiptUrl} 
                                                            alt="Comprovante" 
                                                            className="max-w-full max-h-[400px] object-contain rounded border border-slate-200 shadow-sm"
                                                        />
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
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
                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-widest bg-emerald-50 text-emerald-600 border border-emerald-200">
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
                                        <h3 className="text-sm font-medium text-slate-800 mb-4 flex items-center gap-2">
                                            <Layers size={16} className="text-slate-400"/> Documentos a Faturar
                                        </h3>
                                        <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-100">
                                            <div>
                                                <p className="text-sm font-medium text-slate-700">{selectedIds.length === 1 ? (selectedItem ? getDocLabel(selectedItem) : '—') : `${selectedIds.length} Itens Lançados`}</p>
                                                <p className="text-xs text-slate-500 font-medium mt-0.5">{selectedIds.length === 1 ? selectedItem?.customerName : 'Múltiplos clientes'}</p>
                                            </div>
                                            <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-sm text-slate-400">
                                                <Wallet size={16} />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:border-slate-300 transition-all">
                                        <h3 className="text-sm font-medium text-slate-800 mb-4 flex items-center gap-2">
                                            <DollarSign size={16} className="text-slate-400"/> Resumo Financeiro
                                        </h3>
                                        <div className="space-y-3">
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-slate-500 font-medium">Subtotal</span>
                                                <span className="font-medium text-slate-700">{formatCurrency(selectedIds.length === 1 ? (selectedItem?.value || 0) : selectedTotal)}</span>
                                            </div>
                                            {(() => {
                                                const base = selectedIds.length === 1 ? (selectedItem?.value || 0) : selectedTotal;
                                                const dv = billingDiscountType === 'percent' ? (base * billingDiscount / 100) : billingDiscount;
                                                return dv > 0 ? (
                                                    <div className="flex justify-between items-center text-sm">
                                                        <span className="text-rose-500 font-medium tracking-wide">Desconto</span>
                                                        <span className="font-medium text-rose-500">- {formatCurrency(dv)}</span>
                                                    </div>
                                                ) : null;
                                            })()}
                                            <div className="pt-4 mt-3 border-t border-slate-100 flex justify-between items-center">
                                                <span className="text-xs font-semibold text-slate-800 uppercase tracking-widest">Total a Receber</span>
                                                <span className="text-2xl font-semibold text-emerald-600 tracking-tight">{formatCurrency(Math.max(0, (() => { const base = selectedIds.length === 1 ? (selectedItem?.value || 0) : selectedTotal; const dv = billingDiscountType === 'percent' ? (base * billingDiscount / 100) : billingDiscount; return base - dv; })()))}</span>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:border-slate-300 transition-all">
                                        <h3 className="text-sm font-medium text-slate-800 mb-4 flex items-center gap-2">
                                            <FileText size={16} className="text-slate-400"/> Observações e Comprovante
                                        </h3>
                                        <textarea
                                            className="w-full min-h-[100px] bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-slate-800/20 focus:border-slate-800 transition-all resize-none placeholder:text-slate-400 mb-4"
                                            placeholder="Ex: Nº do comprovante transacional, código Pix, NSU da maquineta..."
                                            value={billingNotes}
                                            onChange={e => setBillingNotes(e.target.value)}
                                        />
                                        
                                        <div className="flex flex-col gap-2">
                                            <label className="text-xs font-medium text-slate-600 flex items-center gap-1.5 cursor-pointer">
                                                <Paperclip size={14} className="text-slate-400"/>
                                                Anexar Comprovante (Imagem/PDF)
                                                <input 
                                                    type="file" 
                                                    className="hidden" 
                                                    accept="image/*,application/pdf"
                                                    onChange={e => {
                                                        if (e.target.files && e.target.files.length > 0) {
                                                            setReceiptFile(e.target.files[0]);
                                                        }
                                                    }}
                                                />
                                            </label>
                                            {receiptFile && (
                                                <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                                                    <span className="text-xs font-medium text-slate-700 truncate max-w-[200px]">{receiptFile.name}</span>
                                                    <button onClick={() => setReceiptFile(null)} className="text-slate-400 hover:text-rose-500 transition-colors">
                                                        <X size={14} />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Lado Direito - Pagamento e Parcelas */}
                                <div className="space-y-6">
                                    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:border-slate-300 transition-all">
                                        <h3 className="text-sm font-medium text-slate-800 mb-4 flex items-center gap-2">
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
                                                    <span className="text-[10px] font-medium uppercase tracking-wider text-center">{method.label}</span>
                                                </button>
                                            ))}
                                        </div>

                                        {/* Parcelas */}
                                        {paymentMethod === 'Cartão Crédito' && (
                                            <div className="mt-5 pt-5 border-t border-slate-100 animate-in fade-in">
                                                <h4 className="text-[10px] font-semibold tracking-widest uppercase text-slate-400 mb-3">Opções de Parcelamento</h4>
                                                
                                                {/* Botões Rápidos 1 a 12 */}
                                                <div className="grid grid-cols-6 gap-2 mb-3">
                                                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(n => (
                                                        <button
                                                            key={n}
                                                            onClick={() => setInstallments(n)}
                                                            className={`py-2 rounded-lg text-[11px] font-semibold transition-all ${installments === n ? 'bg-slate-800 text-white shadow-md scale-105' : 'bg-white border border-slate-200 text-slate-500 hover:border-slate-800 hover:text-slate-800'}`}
                                                        >
                                                            {n}x
                                                        </button>
                                                    ))}
                                                </div>
                                                
                                                {/* Opção Manual e Resumo */}
                                                <div className="p-3 bg-slate-50 rounded-lg flex flex-col md:flex-row items-center justify-between gap-3 border border-slate-100">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Outro valor:</span>
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
                                                                className="w-16 px-2 pr-6 py-1.5 text-xs font-semibold text-slate-800 bg-white border border-slate-200 rounded-md outline-none focus:ring-2 focus:ring-slate-800/20 focus:border-slate-800 transition-all text-center"
                                                            />
                                                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-slate-400 pointer-events-none">x</span>
                                                        </div>
                                                    </div>
                                                    
                                                    <div className="flex flex-col items-end">
                                                        <span className="text-[9px] font-medium text-slate-400 uppercase tracking-widest leading-none mb-1">Valor da Parcela</span>
                                                        <span className="text-sm font-semibold text-slate-800">
                                                            {(() => {
                                                                const base = selectedIds.length === 1 ? (selectedItem?.value || 0) : selectedTotal;
                                                                const dv = billingDiscountType === 'percent' ? (base * billingDiscount / 100) : billingDiscount;
                                                                const finalAmount = Math.max(0, base - dv);
                                                                return `${installments}x de ${formatCurrency(finalAmount / (installments || 1))}`;
                                                            })()}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Desconto Extra */}
                                    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:border-slate-300 transition-all">
                                        <h3 className="text-sm font-medium text-slate-800 mb-4 flex items-center gap-2">
                                            <Tag size={16} className="text-slate-400"/> Aplicar Desconto Extra
                                        </h3>
                                        {can('financial', 'discounts') ? (
                                            <div className="space-y-3 pt-3 border-t border-slate-100">
                                                <div className="flex gap-2">
                                                    <div className="flex rounded-lg overflow-hidden border border-slate-200 shrink-0">
                                                        <button
                                                            type="button"
                                                            onClick={() => setBillingDiscountType('fixed')}
                                                            className={`px-3 py-2 text-[10px] font-semibold transition-all ${billingDiscountType === 'fixed' ? 'bg-slate-800 text-white' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}
                                                        >
                                                            R$
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setBillingDiscountType('percent')}
                                                            className={`px-3 py-2 text-[10px] font-semibold transition-all ${billingDiscountType === 'percent' ? 'bg-slate-800 text-white' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}
                                                        >
                                                            %
                                                        </button>
                                                    </div>
                                                    <div className="relative flex-1">
                                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">
                                                            {billingDiscountType === 'percent' ? '%' : 'R$'}
                                                        </span>
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            max={billingDiscountType === 'percent' ? 100 : undefined}
                                                            step={billingDiscountType === 'percent' ? "1" : "0.01"}
                                                            value={billingDiscount || ''}
                                                            onChange={(e) => setBillingDiscount(Number(e.target.value))}
                                                            className="w-full bg-white border border-slate-200 rounded-lg pl-8 pr-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-slate-800/10 transition-all"
                                                            placeholder="0.00"
                                                        />
                                                    </div>
                                                </div>
                                                {billingDiscount > 0 && (
                                                    <p className="text-[10px] font-medium text-rose-500 bg-rose-50 px-2 py-1.5 rounded-md mt-2 flex items-center justify-between">
                                                        <span>Desconto concedido:</span>
                                                        <span className="font-bold">
                                                            - {billingDiscountType === 'percent'
                                                                ? formatCurrency((selectedIds.length === 1 ? (selectedItem?.value || 0) : selectedTotal) * billingDiscount / 100)
                                                                : formatCurrency(billingDiscount)}
                                                        </span>
                                                    </p>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="mt-4 p-3 bg-slate-50 rounded-lg border border-slate-100 flex items-start gap-2 opacity-50">
                                                <ShieldCheck size={14} className="text-slate-400 shrink-0 mt-0.5" />
                                                <p className="text-[10px] text-slate-500 leading-relaxed">Você não tem permissão para aplicar descontos.</p>
                                            </div>
                                        )}
                                    </div>
                                </div>

                            </div>
                        </div>

                        {/* FOOTER - Padrão OS */}
                        <div className="px-6 py-4 border-t border-slate-100 bg-white flex justify-end gap-3 shrink-0">
                            <button
                                onClick={() => setIsInvoiceModalOpen(false)}
                                className="h-10 px-5 flex items-center justify-center gap-2 text-slate-500 hover:text-slate-800 font-medium transition-colors bg-white hover:bg-slate-50 rounded-lg border border-transparent hover:border-slate-200"
                            >
                                <X size={16} /> Cancelar
                            </button>
                            <button
                                onClick={confirmInvoice}
                                disabled={isProcessing}
                                className="h-10 px-6 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium shadow-md shadow-emerald-600/20 transition-all disabled:opacity-70 disabled:cursor-not-allowed"
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
                <div className="fixed inset-0 z-[3000] bg-white flex items-center justify-center p-4 opacity-0 pointer-events-none print:opacity-100 print:pointer-events-auto print:fixed print:inset-0">
                    <div className="bg-white w-full max-w-3xl max-h-[95vh] overflow-y-auto print:max-w-none print:max-h-none print:overflow-visible">

                        {/* Barra de ação — oculta na impressão */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50 print:hidden">
                            <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Pré-visualização do Recibo</p>
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={executePrint}
                                    className="flex items-center gap-2 px-5 py-2.5 bg-[#1c2d4f] text-white rounded-xl text-xs font-semibold uppercase shadow-md hover:bg-[#253a66] transition-all"
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

                        {/* ─── Conteúdo do Recibo FORMAL SAAS (imprimível) — BASEADO NA O.S E ORÇAMENTO ─── */}
                        <div id="print-container" className="w-full">
                            <div id="printable-receipt" ref={printRef} className="bg-white text-[10px] leading-tight font-poppins p-6 print:p-0 print:break-inside-avoid min-h-[1056px] flex flex-col relative w-[210mm] mx-auto print:w-full" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
                            {/* Marca D'Água (Status) */}
                            <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-[0.03] pointer-events-none select-none text-[8rem] font-semibold uppercase -rotate-45 tracking-widest whitespace-nowrap z-0`}>
                                {printItem.status === 'PAID' ? 'LIQUIDADO' : 'PENDENTE'}
                            </div>

                            <div className="relative z-10 flex-1 flex flex-col">
                                {/* Print Header */}
                                <div className="flex justify-between items-start pb-4 border-b-2 border-slate-800 mb-4">
                                    <div className="flex gap-4 items-center">
                                        {(tenant?.logo_url || tenant?.logoUrl) ? (
                                            <img
                                                src={tenant.logo_url || tenant.logoUrl}
                                                alt={tenant.company_name || tenant.name || 'Logo'}
                                                className="h-16 w-auto object-contain"
                                            />
                                        ) : (
                                            <div className="bg-slate-900 p-2 rounded-lg flex items-center justify-center min-w-[60px] min-h-[60px] text-white">
                                                <Wallet size={32} className="text-white fill-white/10" />
                                            </div>
                                        )}
                                        <div className="space-y-1">
                                            <h1 className="text-xl font-medium text-slate-900 uppercase tracking-tight">{tenant?.company_name || tenant?.trading_name || tenant?.name || 'Sua Empresa'}</h1>
                                            <div className="text-[9px] text-slate-600 max-w-[400px]">
                                                {((tenant?.address || tenant?.street) ? `${tenant.street || tenant.address}${tenant.number ? ', ' + tenant.number : ''}${tenant.neighborhood ? ' - ' + tenant.neighborhood : ''}${tenant.city ? ', ' + tenant.city : ''}${tenant.state ? '/' + tenant.state : ''}` : 'Endereço da Empresa Não Informado')}
                                                <div className="flex flex-wrap gap-x-3 mt-0.5">
                                                    {tenant?.cnpj || tenant?.document ? <span>CNPJ: {tenant.cnpj || tenant.document}</span> : null}
                                                    {tenant?.phone && <span className="font-semibold">Tel: {tenant.phone}</span>}
                                                    {(tenant?.admin_email || tenant?.email) && <span>E-mail: {tenant.admin_email || tenant.email}</span>}
                                                    {tenant?.website && <span>Site: {tenant.website}</span>}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <div className="border-2 border-slate-800 px-5 py-2 rounded-lg bg-slate-50 min-w-[160px]">
                                            <div className="text-[8px] font-semibold text-[#1c2d4f] uppercase tracking-wider mb-0.5 leading-tight">
                                                Comprovante de Faturamento
                                                <div className="text-[7px] font-medium text-slate-500 tracking-widest mt-0.5">
                                                    Referente a {printItem.type === 'QUOTE' ? 'Orçamento' : 'Ordem de Serviço'}
                                                </div>
                                            </div>
                                            <div className="text-base font-semibold text-slate-900 tracking-tight whitespace-nowrap mt-1">{getDocLabel(printItem)}</div>
                                        </div>
                                        <div className="text-[8px] font-medium text-slate-400 mt-2 uppercase tracking-wide">
                                            Emissão: {new Date().toLocaleDateString()} às {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    {/* Dados do Cliente e Faturamento */}
                                    <div className="border border-slate-300 rounded-lg overflow-hidden break-inside-avoid">
                                        <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-300 font-medium text-[9px] uppercase tracking-wider text-slate-700">Dados do Cliente e Faturamento</div>
                                        <div className="grid grid-cols-12 divide-x divide-slate-200">
                                            <div className="col-span-7 p-2.5 space-y-2">
                                                {(() => {
                                                    const fullCust = customers.find(c => c.name?.toLowerCase().trim() === printItem.customerName?.toLowerCase().trim());
                                                    const doc = printItem.customerDocument || fullCust?.document || (fullCust as any)?.cpf || (fullCust as any)?.cnpj;
                                                    const phone = printItem.original?.customerPhone || (printItem as any).customerPhone || fullCust?.whatsapp || fullCust?.phone;
                                                    const email = printItem.original?.customerEmail || (printItem as any).customerEmail || fullCust?.email;
                                                    
                                                    let address = printItem.customerAddress;
                                                    if (!address || address.trim() === '') {
                                                        if (fullCust && fullCust.street) {
                                                            address = `${fullCust.street}, ${fullCust.number || 'S/N'} - ${fullCust.neighborhood || ''} - ${fullCust.city || ''}`;
                                                        } else {
                                                            address = 'Não informado';
                                                        }
                                                    }

                                                    return (
                                                        <>
                                                            <div><label className="block text-[8px] font-medium text-slate-400 uppercase">Cliente / Razão Social</label><div className="font-medium text-slate-900 text-sm uppercase">{printItem.customerName || 'Cliente Não Identificado'}</div></div>
                                                            <div><label className="block text-[8px] font-medium text-slate-400 uppercase">Endereço</label><div className="font-medium text-slate-700 text-xs uppercase">{address}</div></div>
                                                            <div className="grid grid-cols-2 gap-2 mt-2">
                                                                {doc && (
                                                                    <div><label className="block text-[8px] font-medium text-slate-400 uppercase">CPF / CNPJ</label><div className="font-medium text-slate-700 text-xs">{doc}</div></div>
                                                                )}
                                                                {phone && (
                                                                    <div><label className="block text-[8px] font-medium text-slate-400 uppercase">{t.common.phone}</label><div className="font-medium text-slate-700 text-xs">{phone}</div></div>
                                                                )}
                                                                {email && (
                                                                    <div className="col-span-2"><label className="block text-[8px] font-medium text-slate-400 uppercase">{t.common.email}</label><div className="font-medium text-slate-700 text-xs truncate">{email}</div></div>
                                                                )}
                                                            </div>
                                                        </>
                                                    );
                                                })()}
                                            </div>
                                            <div className="col-span-5 p-2.5 grid grid-cols-2 gap-3 bg-slate-50/30">
                                                <div><label className="block text-[8px] font-medium text-slate-400 uppercase">Origem Ref.</label><div className="font-medium uppercase">{printItem.type === 'QUOTE' ? 'Orçamento' : 'Ordem de Serviço'}</div></div>
                                                <div><label className="block text-[8px] font-medium text-slate-400 uppercase">Vencimento</label><div className="font-medium uppercase">{new Date(printItem.date).toLocaleDateString('pt-BR')}</div></div>
                                                <div><label className="block text-[8px] font-medium text-slate-400 uppercase">Status do Pgto</label><div className={`font-medium text-[9px] border px-1.5 py-0.5 rounded inline-block uppercase ${printItem.status === 'PAID' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>{printItem.status === 'PAID' ? 'LIQUIDADO' : 'PENDENTE'}</div></div>
                                                {printItem.original?.paidAt && (
                                                    <div><label className="block text-[8px] font-medium text-slate-400 uppercase">Data do Recebimento</label><div className="font-medium uppercase">{new Date(printItem.original.paidAt).toLocaleDateString('pt-BR')}</div></div>
                                                )}
                                                {printItem.original?.paymentMethod && (
                                                    <div className="col-span-2"><label className="block text-[8px] font-medium text-slate-400 uppercase">Forma de Pagamento / Parcelas</label><div className="font-medium uppercase text-slate-800">{printItem.original.paymentMethod}{renderInstallmentsDetails(printItem)}</div></div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Objeto / Descrição */}
                                    <div className="border border-slate-300 rounded-lg overflow-hidden break-inside-avoid">
                                        <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-300 font-medium text-[9px] uppercase tracking-wider text-slate-700">Objeto do Faturamento</div>
                                        <div className="p-3 bg-white space-y-2">
                                            <div><label className="block text-[8px] font-medium text-slate-400 uppercase">Título / Referência</label><div className="font-medium text-slate-900 text-xs uppercase">{printItem.title || 'Serviços Prestados'}</div></div>
                                            {printItem.description && (
                                                <div><label className="block text-[8px] font-medium text-slate-400 uppercase mt-2">Descrição Registrada</label><div className="text-[11px] text-slate-800 font-medium whitespace-pre-wrap leading-relaxed">{printItem.description}</div></div>
                                            )}
                                            {printItem.original?.billingNotes && (
                                                <div><label className="block text-[8px] font-medium text-slate-400 uppercase mt-2">Observações Fiscais/Faturamento</label><div className="text-[11px] text-slate-800 font-medium whitespace-pre-wrap leading-relaxed">{printItem.original.billingNotes}</div></div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Itens / Composição */}
                                    <div className="border border-slate-300 rounded-lg overflow-hidden">
                                        <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-300 font-medium text-[9px] uppercase tracking-wider text-slate-700">Descritivo dos Lançamentos</div>
                                        <table className="w-full text-left table-fixed">
                                            <thead>
                                                <tr className="bg-slate-50 text-[8px] font-semibold text-slate-500 uppercase border-b border-slate-200">
                                                    <th className="px-3 py-2 w-10">#</th>
                                                    <th className="px-3 py-2">Descrição do Lançamento</th>
                                                    <th className="px-3 py-2 text-center w-16">Tipo</th>
                                                    <th className="px-3 py-2 text-right w-24">V. Nominal</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-200 bg-white">
                                                <tr className="break-inside-avoid">
                                                    <td className="px-3 py-2 text-[10px] font-medium text-slate-400 align-top">01</td>
                                                    <td className="px-3 py-2 text-[10px] uppercase font-medium text-slate-800 break-words whitespace-pre-wrap align-top">Valor Acordado ({printItem.type === 'QUOTE' ? 'Orçamento Base' : 'Ordem de Serviço Base'})</td>
                                                    <td className="px-3 py-2 text-[10px] text-center font-medium text-slate-600 align-top">{printItem.type === 'QUOTE' ? 'ORC' : 'O.S.'}</td>
                                                    <td className="px-3 py-2 text-[10px] text-right font-semibold text-slate-900 font-mono align-top">
                                                        {`R$ ${(printItem?.value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                                                    </td>
                                                </tr>
                                                {printItem.type === 'ORDER' && printItem.original?.linkedQuotes?.length > 0 && (() => {
                                                    const linkedQts = (printItem.original.linkedQuotes as string[]).map((qId: string) => quotes.find(q => q.id === qId)).filter(Boolean);
                                                    return linkedQts.map((q: any, i) => (
                                                        <tr key={q.id} className="bg-slate-50/50 break-inside-avoid">
                                                            <td className="px-3 py-2 text-[10px] font-medium text-slate-400 align-top">0{i + 2}</td>
                                                            <td className="px-3 py-2 text-[10px] uppercase font-medium text-slate-700 break-words whitespace-pre-wrap align-top">Vínculo: {q.title || 'Orçamento Vinculado'} (Ref: {q.displayId || q.id.slice(0, 8)})</td>
                                                            <td className="px-3 py-2 text-[10px] text-center font-medium text-slate-500 align-top">SUB</td>
                                                            <td className="px-3 py-2 text-[10px] text-right font-medium text-slate-500 font-mono align-top">Incluso</td>
                                                        </tr>
                                                    ));
                                                })()}
                                            </tbody>
                                        </table>
                                        <div className="bg-slate-50 border-t border-slate-200 divide-y divide-slate-100">
                                            {(() => {
                                                const grossValue = printItem?.value || 0;
                                                const storedDisc = Number(printItem?.billingDiscount ?? printItem?.original?.discount ?? 0);
                                                const storedDiscType = printItem?.billingDiscountType ?? printItem?.original?.discountType ?? 'fixed';
                                                
                                                let discountAmount = 0;
                                                let discLabel = '';

                                                if (storedDisc > 0) {
                                                    if (storedDiscType === 'percent') {
                                                        discountAmount = grossValue * (storedDisc / 100);
                                                        discLabel = `(${storedDisc}%)`;
                                                    } else {
                                                        discountAmount = storedDisc;
                                                    }
                                                }

                                                const netValue = Math.max(0, grossValue - discountAmount);
                                                const hasDiscount = discountAmount > 0.01;

                                                return (
                                                    <>
                                                        <div className="px-6 py-2 flex justify-end gap-12 items-center">
                                                            <span className="text-[8px] uppercase font-medium tracking-widest text-slate-400">Total Nominal / Bruto</span>
                                                            <span className="text-[10px] font-medium text-slate-600 font-mono">R$ {grossValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                                        </div>
                                                        {hasDiscount && (
                                                            <div className="px-6 py-2 flex justify-end gap-12 items-center">
                                                                <span className="text-[8px] uppercase font-medium tracking-widest text-rose-400 italic">Desconto Aplicado {discLabel}</span>
                                                                <span className="text-[10px] font-medium text-rose-500 font-mono italic">- R$ {discountAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                                            </div>
                                                        )}
                                                        <div className="bg-slate-800 text-white px-6 py-3 flex justify-end gap-12 items-center">
                                                            <span className="text-[10px] uppercase font-semibold tracking-[0.2em] text-slate-300">Total Líquido do Faturamento</span>
                                                            <span className="text-xl font-semibold tracking-tighter font-mono">R$ {netValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                                        </div>
                                                    </>
                                                );
                                            })()}
                                        </div>
                                    </div>

                                    {/* Aceite e Conformidade / Assinaturas */}
                                    <div className="border border-slate-300 rounded-lg overflow-hidden break-inside-avoid mt-4">
                                        <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-300 font-medium text-[9px] uppercase tracking-wider text-slate-700">Autenticação e Assinaturas</div>
                                        <div className="grid grid-cols-2 divide-x divide-slate-300 bg-white text-center">
                                            <div className="p-4 flex flex-col items-center justify-center gap-3">
                                                <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-widest">Emitente / Responsável</p>
                                                <div className="h-[60px] flex items-center justify-center text-slate-200 italic text-[10px] font-medium uppercase">
                                                    Visto Eletrônico Nexus
                                                </div>
                                                <div className="w-full border-t border-slate-300 pt-2">
                                                    <p className="text-[12px] font-semibold text-slate-900 uppercase">{tenant?.company_name || 'Assinatura Oficial'}</p>
                                                    <p className="text-[9px] font-medium text-slate-500 uppercase tracking-widest mt-0.5">Técnico: {printItem.technician || '—'}</p>
                                                </div>
                                            </div>
                                            <div className="p-4 flex flex-col items-center justify-center gap-3">
                                                <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-widest">De Acordo / Assinatura do Cliente</p>
                                                <div className="h-[60px] flex items-center justify-center">
                                                    {printItem.status === 'PAID' ? (
                                                        <span className="text-emerald-300 italic text-[10px] font-medium uppercase">Liquidado Eletronicamente</span>
                                                    ) : (
                                                        <span className="text-slate-200 italic text-[10px] font-medium uppercase">—</span>
                                                    )}
                                                </div>
                                                <div className="w-full border-t border-slate-300 pt-2">
                                                    <p className="text-[12px] font-semibold text-slate-900 uppercase">{printItem.customerName || 'Cliente'}</p>
                                                    <p className="text-[9px] font-medium text-slate-500 uppercase tracking-widest mt-0.5">{printItem.customerDocument ? `Doc: ${printItem.customerDocument}` : ''}</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Footer Minimalista SaaS */}
                                <div className="mt-8 pt-4 border-t-2 border-slate-800 flex justify-end items-center text-slate-500">
                                    <div className="text-right">
                                        <p className="text-[7px] uppercase tracking-tight mt-0.5">Recibo emitido eletronicamente. Auditável na plataforma central.</p>
                                    </div>
                                </div>
                            </div>
                            </div>{/* fecha #printable-receipt */}

                            {/* Página 2: Comprovante Anexo (dentro do print-container) */}
                            {(printItem.original?.receiptUrl && printWithAttachment) && (
                                <div className="bg-white text-[10px] leading-tight font-poppins p-6 print:p-0 flex flex-col relative w-[210mm] mx-auto print:w-full" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact', pageBreakBefore: 'always', breakBefore: 'page' }}>
                                    <div className="border-b-2 border-slate-800 pb-4 mb-6">
                                        <h2 className="text-xl font-medium text-slate-900 uppercase tracking-tight">Comprovante de Transação</h2>
                                        <p className="text-[10px] text-slate-500 mt-1 uppercase">Anexo referente ao faturamento: {getDocLabel(printItem)}</p>
                                    </div>
                                    <div className="flex-1 flex flex-col items-center justify-start">
                                        {printItem.original.receiptUrl.toLowerCase().includes('.pdf') ? (
                                            <div className="w-full border-2 border-dashed border-slate-300 rounded-xl p-10 flex flex-col items-center justify-center text-center">
                                                <Paperclip size={48} className="text-slate-300 mb-4" />
                                                <p className="text-sm font-medium text-slate-600 mb-2">Comprovante em formato PDF anexado</p>
                                                <p className="text-[10px] text-slate-400">Os documentos PDF precisam ser impressos a partir do visualizador digital original.</p>
                                            </div>
                                        ) : (
                                            <img
                                                src={printItem.original.receiptUrl}
                                                alt="Comprovante"
                                                className="max-w-full object-contain border border-slate-200 rounded-lg shadow-sm"
                                                style={{ maxHeight: '85vh' }}
                                            />
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ── POPUP: Imprimir comprovante? ── */}
            {showAttachmentConfirmModal && pendingPrintItem && (
                <div className="fixed inset-0 z-[4000] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm border border-slate-200 overflow-hidden">
                        <div className="p-6">
                            <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center mx-auto mb-4">
                                <Paperclip size={22} className="text-blue-600" />
                            </div>
                            <h3 className="text-base font-semibold text-slate-800 text-center mb-1">Imprimir Comprovante?</h3>
                            <p className="text-xs text-slate-500 text-center font-medium">
                                Este faturamento possui um comprovante anexado.<br/>Deseja incluí-lo na impressão como segunda página?
                            </p>
                        </div>
                        <div className="flex flex-col gap-2 px-6 pb-6">
                            <button
                                onClick={() => {
                                    const item = pendingPrintItem;
                                    flushSync(() => {
                                        setPrintWithAttachment(true);
                                        setPrintItem(item);
                                        setIsPrintModalOpen(true);
                                        setShowAttachmentConfirmModal(false);
                                        setPendingPrintItem(null);
                                    });
                                    executePrint(true);
                                }}
                                className="w-full py-3 bg-[#1c2d4f] hover:bg-[#253a66] text-white rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2"
                            >
                                <Printer size={16} /> Imprimir comprovante junto
                            </button>
                            <button
                                onClick={() => {
                                    const item = pendingPrintItem;
                                    flushSync(() => {
                                        setPrintWithAttachment(false);
                                        setPrintItem(item);
                                        setIsPrintModalOpen(true);
                                        setShowAttachmentConfirmModal(false);
                                        setPendingPrintItem(null);
                                    });
                                    executePrint(false);
                                }}
                                className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2"
                            >
                                <FileText size={16} /> Não imprimir comprovante junto
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
                .animate-slide-in-right { animation: slideInRight 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
                @media print {
                    .print\\:hidden { visibility: hidden !important; display: none !important; }
                }
            `}</style>
        </div>
    );
};
