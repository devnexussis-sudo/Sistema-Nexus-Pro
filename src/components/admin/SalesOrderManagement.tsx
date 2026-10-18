import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    ShoppingBag,
    Plus,
    Search,
    Filter,
    Calendar,
    FileSpreadsheet,
    Printer,
    Download,
    Trash2,
    Eye,
    Edit3,
    RefreshCw,
    X,
    User,
    CreditCard,
    FileText,
    ListPlus,
    Loader2,
    CheckCircle,
    Clock,
    Lock,
    Tag,
    ChevronDown,
    Building2,
    Check,
    Truck,
    Percent,
    DollarSign,
    Package,
    Minus,
    AlertCircle,
    Hexagon,
    ShieldCheck,
    ShieldOff
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useDialog } from '../../contexts/DialogContext';
import { usePermissions } from '../../hooks/usePermissions';
import { useI18n } from '../../i18n';
import { Customer, SalesOrder, SalesOrderItem, SalesOrderStatus, StockItem } from '../../types';
import { NexusBranding } from '../ui/NexusBranding';
import { Pagination } from '../ui/Pagination';
import { usePagedSalesOrders, useTenant, useStock } from '../../hooks/nexusHooks';
import { SalesOrderService } from '../../services/salesOrderService';
import { StockService } from '../../services/stockService';

interface SalesOrderManagementProps {
    customers: Customer[];
    stockItems?: StockItem[];
    tenant?: any;
    onRefresh?: () => Promise<void>;
}

export const SalesOrderManagement: React.FC<SalesOrderManagementProps> = ({
    customers,
    stockItems: stockItemsProp = [],
    tenant: tenantProp,
    onRefresh
}) => {
    const { t } = useI18n();
    const { showAlert, showConfirm } = useDialog();
    const { canCreate, canEdit, canDelete, can, canAccessMenu, isAdmin } = usePermissions();
    const { auth } = useAuth();

    // ── Estados Principais ──────────────────────────────────────────
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isViewModalOpen, setIsViewModalOpen] = useState(false);
    const [isReadOnly, setIsReadOnly] = useState<boolean>(false);
    const [selectedOrder, setSelectedOrder] = useState<SalesOrder | null>(null);
    const [viewOrder, setViewOrder] = useState<SalesOrder | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [showFilters, setShowFilters] = useState(false);
    const [isManualSyncing, setIsManualSyncing] = useState(false);
    const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
    const [isExportingExcel, setIsExportingExcel] = useState(false);
    const [loading, setLoading] = useState(false);

    // ── Filtros ────────────────────────────────────────────────────
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

    // ── Paginação Server-Side ───────────────────────────────────────
    const serverFilters = useMemo(() => ({
        search: searchTerm.trim() || undefined,
        status: statusFilter !== 'ALL' ? statusFilter : undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
    }), [searchTerm, statusFilter, startDate, endDate]);

    const {
        data: pageResult,
        isLoading: ordersLoading,
        isFetching: ordersFetching,
        refetch: ordersRefetch,
    } = usePagedSalesOrders(currentPage, serverFilters, auth.isAuthenticated);

    const pagedOrders = pageResult?.data ?? [];
    const totalOrders = pageResult?.total ?? 0;
    const totalPages = pageResult?.lastPage ?? 1;

    const handleManualRefresh = async () => {
        setIsManualSyncing(true);
        try {
            await Promise.all([
                ordersRefetch(),
                onRefresh && onRefresh()
            ]);
            await new Promise(resolve => setTimeout(resolve, 600));
        } catch (error) {
            console.error('Erro ao sincronizar pedidos:', error);
        } finally {
            setIsManualSyncing(false);
        }
    };

    // ── Form States (Criação / Edição do Pedido) ───────────────────
    const [customerName, setCustomerName] = useState('');
    const [customerDocument, setCustomerDocument] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [customerEmail, setCustomerEmail] = useState('');
    const [customerAddress, setCustomerAddress] = useState('');
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
    const [clientSearch, setClientSearch] = useState('');
    const [isClientListOpen, setIsClientListOpen] = useState(false);

    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [items, setItems] = useState<SalesOrderItem[]>([]);
    const [notes, setNotes] = useState('');
    const [orderStatus, setOrderStatus] = useState<SalesOrderStatus>('PENDENTE');
    const [shipping, setShipping] = useState<number | string>(0);
    const [discount, setDiscount] = useState<number | string>(0);
    const [discountType, setDiscountType] = useState<'fixed' | 'percent'>('fixed');
    const [paymentMethod, setPaymentMethod] = useState('Pix');
    const [installments, setInstallments] = useState(1);
    const [paymentNotes, setPaymentNotes] = useState('');

    // ── Barra Rápida de Adição de Itens (PDV) ──────────────────────
    const [itemType, setItemType] = useState<'stock' | 'manual'>('stock');
    const [stockSearchTerm, setStockSearchTerm] = useState('');
    const [isStockDropdownOpen, setIsStockDropdownOpen] = useState(false);
    const [selectedStockItem, setSelectedStockItem] = useState<StockItem | null>(null);
    const [manualDescription, setManualDescription] = useState('');
    const [manualCode, setManualCode] = useState('');
    const [itemQuantity, setItemQuantity] = useState<number | string>(1);
    const [itemUnitPrice, setItemUnitPrice] = useState<number | string>(0);

    const { data: tenantHook } = useTenant(auth.isAuthenticated);
    const tenant = useMemo(() => tenantProp || tenantHook, [tenantProp, tenantHook]);

    // 📦 Resiliência de Estoque: se stockItems não veio por prop (ou veio vazio), usa o hook useStock
    const { data: stockItemsFromHook = [], isLoading: isStockLoading } = useStock(auth.isAuthenticated);
    const stockItems = useMemo(() => {
        if (stockItemsProp && stockItemsProp.length > 0) return stockItemsProp;
        return stockItemsFromHook || [];
    }, [stockItemsProp, stockItemsFromHook]);

    // 🎯 Refs para controle de dropdown com fechamento seguro ao clicar fora
    const clientDropdownRef = useRef<HTMLDivElement>(null);
    const stockDropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (clientDropdownRef.current && !clientDropdownRef.current.contains(event.target as Node)) {
                setIsClientListOpen(false);
            }
            if (stockDropdownRef.current && !stockDropdownRef.current.contains(event.target as Node)) {
                setIsStockDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // 📡 Busca remota em tempo real no Supabase (cobre todo o catálogo de estoque por nome, código, barras)
    const [dbSearchResults, setDbSearchResults] = useState<StockItem[]>([]);
    const [isSearchingDb, setIsSearchingDb] = useState(false);

    useEffect(() => {
        const term = stockSearchTerm.trim();
        if (!term || term.length < 1) {
            setDbSearchResults([]);
            return;
        }

        const tid = tenant?.id || auth.user?.tenantId;
        if (!tid) return;

        const timer = setTimeout(async () => {
            try {
                setIsSearchingDb(true);
                const digits = term.replace(/\D/g, '');

                const orConditions: string[] = [
                    `description.ilike.%${term}%`,
                    `code.ilike.%${term}%`,
                    `external_code.ilike.%${term}%`
                ];
                if (digits.length >= 2) {
                    orConditions.push(`code.ilike.%${digits}%`);
                    orConditions.push(`external_code.ilike.%${digits}%`);
                }

                const { data, error } = await supabase
                    .from('stock_items')
                    .select('*')
                    .eq('tenant_id', tid)
                    .or(orConditions.join(','))
                    .order('description')
                    .limit(30);

                if (!error && data) {
                    setDbSearchResults(data.map(StockService._mapStockItemFromDB));
                }
            } catch (err) {
                console.warn('[SalesOrderManagement] Erro na busca remota de estoque:', err);
            } finally {
                setIsSearchingDb(false);
            }
        }, 150);

        return () => clearTimeout(timer);
    }, [stockSearchTerm, tenant?.id, auth.user?.tenantId]);

    const resolvedCompanyLogo = useMemo(() => {
        const t = tenant || {};
        let logo = t.logo_url || t.logoUrl;
        if (!logo) {
            try {
                const rawCompany = JSON.parse(localStorage.getItem('nexus_settings_company') || '{}');
                const rawSettings = JSON.parse(localStorage.getItem('nexus_settings') || '{}');
                const comp = (rawCompany?.logoUrl || rawCompany?.logo_url) ? rawCompany : (rawSettings?.company || {});
                logo = comp.logoUrl || comp.logo_url || comp.logo;
            } catch {}
        }
        return logo || null;
    }, [tenant]);

    const companyInfo = useMemo(() => {
        let t: any = tenant || {};
        if (!t.name && !t.company_name && !t.trading_name) {
            try {
                const rawCompany = JSON.parse(localStorage.getItem('nexus_settings_company') || '{}');
                const rawSettings = JSON.parse(localStorage.getItem('nexus_settings') || '{}');
                t = (rawCompany && Object.keys(rawCompany).length > 0) ? rawCompany : (rawSettings?.company || t);
            } catch {}
        }
        return {
            name: t.trading_name || t.company_name || t.name || 'Duno Sistema',
            address: [t.street || t.address, t.city, t.state].filter(Boolean).join(' - ') || t.address || '',
            phone: t.phone || t.whatsapp || '',
            email: t.email || '',
            doc: t.cnpj || t.document || ''
        };
    }, [tenant]);

    const freshCustomer = useMemo(() => {
        if (!viewOrder) return null;
        return customers.find(c => c.name === viewOrder.customerName || (viewOrder.customerId && c.id === viewOrder.customerId));
    }, [viewOrder, customers]);

    const filteredClients = useMemo(() => {
        const term = clientSearch.toLowerCase().trim();
        if (!term) return customers.slice(0, 15);
        return customers.filter(c =>
            c.name.toLowerCase().includes(term) ||
            (c.document && c.document.toLowerCase().includes(term)) ||
            (c.cpf && c.cpf.toLowerCase().includes(term)) ||
            (c.cnpj && c.cnpj.toLowerCase().includes(term)) ||
            (c.phone && c.phone.includes(term)) ||
            (c.whatsapp && c.whatsapp.includes(term)) ||
            (c.email && c.email.toLowerCase().includes(term))
        ).slice(0, 15);
    }, [clientSearch, customers]);

    // 🔍 Filtro Universal de Estoque: Nome, Código SKU, Código Interno, Código de Barras e Dígitos
    const filteredStockItems = useMemo(() => {
        const q = stockSearchTerm.trim().toLowerCase();
        const digits = stockSearchTerm.replace(/\D/g, '');

        // 1. Filtragem na memória local (stockItems)
        const inMemoryMatches = stockItems.filter(s => {
            if (s.active === false) return false;
            if (!q) return true;

            // Busca por Descrição / Nome
            if (s.description && s.description.toLowerCase().includes(q)) return true;

            // Busca por Código (SKU)
            if (s.code && s.code.toLowerCase().includes(q)) return true;

            // Busca por Código Interno / Fabricante / Código de Barras (externalCode)
            if (s.externalCode && s.externalCode.toLowerCase().includes(q)) return true;

            // Busca por Código de Barras específico se presente
            if ((s as any).barcode && String((s as any).barcode).toLowerCase().includes(q)) return true;

            // Busca por Categoria
            if (s.category && s.category.toLowerCase().includes(q)) return true;

            // Busca por dígitos numéricos (leitor de código de barras ou teclado numérico)
            if (digits.length >= 2) {
                if (s.code && s.code.replace(/\D/g, '').includes(digits)) return true;
                if (s.externalCode && s.externalCode.replace(/\D/g, '').includes(digits)) return true;
                if ((s as any).barcode && String((s as any).barcode).replace(/\D/g, '').includes(digits)) return true;
            }

            return false;
        });

        // 2. Mescla com resultados remotos do banco de dados (sem duplicatas por ID)
        const mergedMap = new Map<string, StockItem>();
        inMemoryMatches.forEach(item => mergedMap.set(item.id, item));
        dbSearchResults.forEach(item => {
            if (!mergedMap.has(item.id)) {
                mergedMap.set(item.id, item);
            }
        });

        return Array.from(mergedMap.values()).slice(0, 30);
    }, [stockSearchTerm, stockItems, dbSearchResults]);

    // ── Cálculos Financeiros PDV ──────────────────────────────────
    const subtotal = useMemo(() => items.reduce((acc, curr) => acc + (Number(curr.total) || 0), 0), [items]);
    const discountAmount = useMemo(() => {
        const d = Number(String(discount).replace(',', '.')) || 0;
        return discountType === 'percent' ? (subtotal * d / 100) : d;
    }, [subtotal, discount, discountType]);
    const totalValue = useMemo(() => {
        const s = Number(String(shipping).replace(',', '.')) || 0;
        return Math.max(0, subtotal + s - discountAmount);
    }, [subtotal, shipping, discountAmount]);

    const handleSelectCustomer = (c: Customer) => {
        setSelectedCustomer(c);
        setCustomerName(c.name);
        setCustomerDocument(c.document || c.cpf || c.cnpj || '');
        setCustomerPhone(c.whatsapp || c.phone || '');
        setCustomerEmail(c.email || '');
        const fullAddr = [c.address, c.number, c.complement, c.neighborhood, c.city, c.state].filter(Boolean).join(', ');
        setCustomerAddress(fullAddr || c.address || '');
        setIsClientListOpen(false);
        setClientSearch('');
    };

    const handleClearCustomer = () => {
        setSelectedCustomer(null);
        setCustomerName('');
        setCustomerDocument('');
        setCustomerPhone('');
        setCustomerEmail('');
        setCustomerAddress('');
        setClientSearch('');
    };

    const handleSelectStockItem = (s: StockItem) => {
        setSelectedStockItem(s);
        const codeLabel = s.code ? `[${s.code}] ` : (s.externalCode ? `[${s.externalCode}] ` : '');
        setStockSearchTerm(`${codeLabel}${s.description}`);
        setItemUnitPrice(Number(s.sellPrice || 0));
        setIsStockDropdownOpen(false);
    };

    const handleAddQuickItem = () => {
        if (itemType === 'stock') {
            let targetStockItem = selectedStockItem;
            // Se o usuário digitou ou bipou e não clicou no dropdown, mas temos exatamente 1 resultado
            if (!targetStockItem && filteredStockItems.length === 1) {
                targetStockItem = filteredStockItems[0];
            }

            if (!targetStockItem) {
                showAlert('Por favor, busque e selecione uma peça do estoque na lista.', 'warning');
                return;
            }
            const qty = Math.max(1, Number(String(itemQuantity).replace(',', '.')) || 1);
            const price = Number(String(itemUnitPrice).replace(',', '.')) > 0 ? Number(String(itemUnitPrice).replace(',', '.')) : Number(targetStockItem.sellPrice || 0);
            const newItem: SalesOrderItem = {
                id: Math.random().toString(36).substr(2, 9),
                description: targetStockItem.description,
                stockCode: targetStockItem.code || targetStockItem.externalCode || undefined,
                stockItemId: targetStockItem.id,
                quantity: qty,
                unitPrice: price,
                total: Math.round(qty * price * 100) / 100
            };
            setItems(prev => [...prev, newItem]);
            setSelectedStockItem(null);
            setStockSearchTerm('');
            setItemQuantity(1);
            setItemUnitPrice(0);
        } else {
            if (!manualDescription.trim()) {
                showAlert('Por favor, informe a descrição do item manual.', 'warning');
                return;
            }
            const qty = Math.max(1, Number(String(itemQuantity).replace(',', '.')) || 1);
            const price = Math.max(0, Number(String(itemUnitPrice).replace(',', '.')) || 0);
            const newItem: SalesOrderItem = {
                id: Math.random().toString(36).substr(2, 9),
                description: manualDescription.trim(),
                stockCode: manualCode.trim() || undefined,
                quantity: qty,
                unitPrice: price,
                total: Math.round(qty * price * 100) / 100
            };
            setItems(prev => [...prev, newItem]);
            setManualDescription('');
            setManualCode('');
            setItemQuantity(1);
            setItemUnitPrice(0);
        }
    };

    const updateItem = (index: number, fields: any) => {
        const newItems = [...items];
        newItems[index] = { ...newItems[index], ...fields };
        const q = Number(String(newItems[index].quantity ?? '').replace(',', '.')) || 0;
        const u = Number(String(newItems[index].unitPrice ?? '').replace(',', '.')) || 0;
        newItems[index].total = Math.round(q * u * 100) / 100;
        setItems(newItems);
    };

    const removeItem = (index: number) => {
        setItems(items.filter((_, i) => i !== index));
    };

    const resetForm = () => {
        setSelectedOrder(null);
        setSelectedCustomer(null);
        setCustomerName('');
        setCustomerDocument('');
        setCustomerPhone('');
        setCustomerEmail('');
        setCustomerAddress('');
        setClientSearch('');
        setTitle('');
        setDescription('');
        setItems([]);
        setNotes('');
        setOrderStatus('PENDENTE');
        setShipping(0);
        setDiscount(0);
        setDiscountType('fixed');
        setPaymentMethod('Pix');
        setInstallments(1);
        setPaymentNotes('');
        setLoading(false);
        setIsReadOnly(false);
        // Reset barra rápida
        setItemType('stock');
        setSelectedStockItem(null);
        setStockSearchTerm('');
        setManualDescription('');
        setManualCode('');
        setItemQuantity(1);
        setItemUnitPrice(0);
        setIsStockDropdownOpen(false);
        setIsClientListOpen(false);
    };

    const handleOpenCreateModal = () => {
        if (!isAdmin && !canCreate('sales_orders')) {
            showAlert('Seu grupo de usuário não possui permissão para emitir novos Pedidos de Venda.', 'warning');
            return;
        }
        resetForm();
        setTitle('Venda de Produtos e Peças');
        setOrderStatus('PENDENTE');
        setIsReadOnly(false);
        setIsModalOpen(true);
    };

    /**
     * 👁️ Abrir Pedido no Modo Visualização (Read-Only)
     * Acionado ao clicar na linha da tabela ou no botão de visualizar.
     */
    const handleViewOrder = (order: SalesOrder) => {
        resetForm();
        setSelectedOrder(order);
        setCustomerName(order.customerName || '');
        setCustomerDocument(order.customerDocument || '');
        setCustomerPhone(order.customerPhone || '');
        setCustomerEmail(order.customerEmail || '');
        setCustomerAddress(order.customerAddress || '');
        const matchCust = customers.find(c => c.name === order.customerName || (order.customerId && c.id === order.customerId));
        setSelectedCustomer(matchCust || null);
        setTitle(order.title || 'Venda de Produtos e Peças');
        setDescription(order.description || '');
        setItems(order.items || []);
        setNotes(order.notes || '');
        setOrderStatus(order.status || 'PENDENTE');
        setShipping(Number(order.shipping) || 0);
        setDiscount(Number(order.discount) || 0);
        setDiscountType(order.discountType || 'fixed');
        setPaymentMethod(order.paymentMethod || 'Pix');
        setInstallments(Number(order.installments) || 1);
        setPaymentNotes(order.paymentNotes || '');
        setIsReadOnly(true);
        setIsModalOpen(true);
    };

    /**
     * ✏️ Abrir Pedido no Modo Edição Direta
     * Acionado ao clicar no ícone de lápis na lista da tabela.
     */
    const handleEditOrder = (order: SalesOrder) => {
        if (!isAdmin && !canEdit('sales_orders')) {
            showAlert('Seu grupo de usuário não possui permissão para editar Pedidos de Venda. Abrindo no modo visualização.', 'warning');
            handleViewOrder(order);
            return;
        }

        const rawSt = String(order.status || '').toUpperCase();
        if (rawSt === 'CONCLUIDO' || rawSt === 'FATURADO') {
            showAlert('Este pedido já foi finalizado e concluído, portanto não pode mais ser editado. Abrindo no modo visualização.', 'warning');
            handleViewOrder(order);
            return;
        }

        resetForm();
        setSelectedOrder(order);
        setCustomerName(order.customerName || '');
        setCustomerDocument(order.customerDocument || '');
        setCustomerPhone(order.customerPhone || '');
        setCustomerEmail(order.customerEmail || '');
        setCustomerAddress(order.customerAddress || '');
        const matchCust = customers.find(c => c.name === order.customerName || (order.customerId && c.id === order.customerId));
        setSelectedCustomer(matchCust || null);
        setTitle(order.title || 'Venda de Produtos e Peças');
        setDescription(order.description || '');
        setItems(order.items || []);
        setNotes(order.notes || '');
        setOrderStatus(order.status || 'PENDENTE');
        setShipping(Number(order.shipping) || 0);
        setDiscount(Number(order.discount) || 0);
        setDiscountType(order.discountType || 'fixed');
        setPaymentMethod(order.paymentMethod || 'Pix');
        setInstallments(Number(order.installments) || 1);
        setPaymentNotes(order.paymentNotes || '');
        setIsReadOnly(false);
        setIsModalOpen(true);
    };

    /**
     * 🔄 Alternar de Modo Visualização para Edição diretamente de dentro do Modal
     */
    const handleSwitchToEdit = () => {
        if (!selectedOrder) return;
        if (!isAdmin && !canEdit('sales_orders')) {
            showAlert('Seu grupo de usuário não possui permissão para editar Pedidos de Venda.', 'warning');
            return;
        }
        const rawSt = String(selectedOrder.status || '').toUpperCase();
        if (rawSt === 'CONCLUIDO' || rawSt === 'FATURADO') {
            showAlert('Este pedido já foi finalizado e concluído, portanto não pode ser editado.', 'warning');
            return;
        }
        setIsReadOnly(false);
    };

    const handleSaveOrder = async () => {
        if (selectedOrder) {
            if (!isAdmin && !canEdit('sales_orders')) {
                showAlert('Seu grupo de usuário não possui permissão para editar Pedidos de Venda.', 'error');
                return;
            }
        } else {
            if (!isAdmin && !canCreate('sales_orders')) {
                showAlert('Seu grupo de usuário não possui permissão para emitir Pedidos de Venda.', 'error');
                return;
            }
        }

        if (!customerName) {
            showAlert('Por favor, selecione ou informe o cliente.', 'error');
            return;
        }

        if (!title.trim()) {
            showAlert('Por favor, informe o título do pedido de venda.', 'error');
            return;
        }

        if (items.length === 0) {
            showAlert('O pedido deve conter pelo menos um item.', 'error');
            return;
        }

        try {
            setLoading(true);
            const payload: any = {
                customerId: selectedCustomer?.id || undefined,
                createdBy: auth.user?.id || undefined,
                createdByName: auth.user?.name || auth.user?.email || 'Usuário do Sistema',
                customerName: customerName.trim(),
                customerAddress: customerAddress || selectedCustomer?.address || '',
                customerDocument: customerDocument || selectedCustomer?.document || selectedCustomer?.cpf || selectedCustomer?.cnpj || '00000000000000',
                customerPhone: customerPhone || selectedCustomer?.whatsapp || selectedCustomer?.phone || '',
                customerEmail: customerEmail || selectedCustomer?.email || '',
                title: title.trim() || 'Venda de Produtos e Peças',
                description: description.trim() || undefined,
                items: items.map(it => {
                    const q = Math.max(1, Number(String(it.quantity).replace(',', '.')) || 1);
                    const u = Math.max(0, Number(String(it.unitPrice).replace(',', '.')) || 0);
                    return {
                        ...it,
                        quantity: q,
                        unitPrice: u,
                        total: Math.round(q * u * 100) / 100
                    };
                }),
                subtotal,
                shipping: Math.max(0, Number(String(shipping).replace(',', '.')) || 0),
                discount: Math.max(0, Number(String(discount).replace(',', '.')) || 0),
                discountType,
                totalValue,
                notes: notes.trim() || undefined,
                status: selectedOrder ? (selectedOrder.status || 'PENDENTE') : 'PENDENTE',
                paymentMethod: paymentMethod || 'Pix',
                installments: Number(installments) || 1,
                paymentNotes: paymentNotes || undefined,
                billingStatus: 'PENDING'
            };

            if (selectedOrder) {
                await SalesOrderService.updateSalesOrder({ ...selectedOrder, ...payload });
                showAlert('Pedido de Venda atualizado com sucesso!', 'success');
            } else {
                await SalesOrderService.createSalesOrder(payload);
                showAlert('Pedido de Venda criado com sucesso (Status: Pendente). Você pode editá-lo ou finalizá-lo para enviar ao Financeiro.', 'success');
            }

            setIsModalOpen(false);
            resetForm();
            await ordersRefetch();
            if (onRefresh) await onRefresh();
        } catch (error: any) {
            console.error('[SalesOrderManagement] Erro ao salvar pedido:', error);
            showAlert(`Falha ao salvar pedido: ${error.message || 'Erro desconhecido'}`, 'error');
        } finally {
            setLoading(false);
        }
    };

    /**
     * 🚀 Finalização de Pedido na listagem (Transição PENDENTE -> CONCLUIDO)
     */
    const handleFinalizeOrder = (order: SalesOrder) => {
        if (!isAdmin && !canEdit('sales_orders')) {
            showAlert('Seu grupo de usuário não possui permissão para finalizar Pedidos de Venda.', 'warning');
            return;
        }

        const rawSt = String(order.status || '').toUpperCase();
        if (rawSt !== 'PENDENTE' && rawSt !== 'RASCUNHO') {
            showAlert('Apenas pedidos com status Pendente podem ser finalizados.', 'warning');
            return;
        }

        showConfirm(
            `Deseja realmente finalizar o Pedido de Venda ${order.displayId || ''}?\n\n` +
            `• O status será alterado para CONCLUÍDO.\n` +
            `• As peças de estoque sofrerão baixa imediata.\n` +
            `• O pedido será encaminhado ao Financeiro (Contas a Receber) para faturamento.\n` +
            `• O pedido será bloqueado e não poderá mais ser editado.`,
            async () => {
                try {
                    setLoading(true);
                    await SalesOrderService.finalizeSalesOrder(order);
                    showAlert(`Pedido ${order.displayId || ''} finalizado com sucesso! Lançado em Contas a Receber e estoque baixado.`, 'success');
                    await ordersRefetch();
                    if (onRefresh) await onRefresh();
                } catch (err: any) {
                    console.error('[SalesOrderManagement] Erro ao finalizar pedido:', err);
                    showAlert(`Falha ao finalizar pedido: ${err.message || 'Erro desconhecido'}`, 'error');
                } finally {
                    setLoading(false);
                }
            },
            'Finalizar Pedido de Venda',
            'Finalizar e Faturar'
        );
    };

    /**
     * 🚀 Salvar e Finalizar Venda diretamente de dentro do Modal
     */
    const handleSaveAndFinalize = async () => {
        if (selectedOrder) {
            if (!isAdmin && !canEdit('sales_orders')) {
                showAlert('Seu grupo de usuário não possui permissão para editar e finalizar Pedidos de Venda.', 'warning');
                return;
            }
        } else {
            if (!isAdmin && !canCreate('sales_orders')) {
                showAlert('Seu grupo de usuário não possui permissão para criar e finalizar Pedidos de Venda.', 'warning');
                return;
            }
        }

        if (!customerName) {
            showAlert('Por favor, selecione ou informe o cliente.', 'error');
            return;
        }

        if (!title.trim()) {
            showAlert('Por favor, informe o título do pedido de venda.', 'error');
            return;
        }

        if (items.length === 0) {
            showAlert('O pedido deve conter pelo menos um item.', 'error');
            return;
        }

        showConfirm(
            `Deseja finalizar este pedido agora?\n\n` +
            `• O status passará para CONCLUÍDO.\n` +
            `• As peças vinculadas sofrerão baixa imediata no estoque.\n` +
            `• O pedido será enviado ao Financeiro (Contas a Receber) para faturamento.\n` +
            `• O pedido será bloqueado e não poderá mais ser editado.`,
            async () => {
                try {
                    setLoading(true);
                    const payload: any = {
                        customerId: selectedCustomer?.id || undefined,
                        createdBy: auth.user?.id || undefined,
                        createdByName: auth.user?.name || auth.user?.email || 'Usuário do Sistema',
                        customerName: customerName.trim(),
                        customerAddress: customerAddress || selectedCustomer?.address || '',
                        customerDocument: customerDocument || selectedCustomer?.document || selectedCustomer?.cpf || selectedCustomer?.cnpj || '00000000000000',
                        customerPhone: customerPhone || selectedCustomer?.whatsapp || selectedCustomer?.phone || '',
                        customerEmail: customerEmail || selectedCustomer?.email || '',
                        title: title.trim() || 'Venda de Produtos e Peças',
                        description: description.trim() || undefined,
                        items,
                        subtotal,
                        shipping: Number(shipping) || 0,
                        discount: Number(discount) || 0,
                        discountType,
                        totalValue,
                        notes: notes.trim() || undefined,
                        status: 'PENDENTE',
                        paymentMethod: paymentMethod || 'Pix',
                        installments: Number(installments) || 1,
                        paymentNotes: paymentNotes || undefined,
                        billingStatus: 'PENDING'
                    };

                    let targetOrder: SalesOrder;
                    if (selectedOrder) {
                        targetOrder = await SalesOrderService.updateSalesOrder({ ...selectedOrder, ...payload });
                    } else {
                        targetOrder = await SalesOrderService.createSalesOrder(payload);
                    }

                    await SalesOrderService.finalizeSalesOrder(targetOrder);
                    showAlert(`Pedido ${targetOrder.displayId || ''} finalizado com sucesso! Lançado no Financeiro e estoque atualizado.`, 'success');

                    setIsModalOpen(false);
                    resetForm();
                    await ordersRefetch();
                    if (onRefresh) await onRefresh();
                } catch (error: any) {
                    console.error('[SalesOrderManagement] Erro ao finalizar pedido:', error);
                    showAlert(`Falha ao finalizar pedido: ${error.message || 'Erro desconhecido'}`, 'error');
                } finally {
                    setLoading(false);
                }
            },
            'Finalizar Pedido de Venda',
            'Finalizar Venda'
        );
    };

    const handleDeleteOrder = (id: string) => {
        if (!isAdmin && !canDelete('sales_orders')) {
            showAlert('Seu grupo de usuário não possui permissão para excluir Pedidos de Venda.', 'warning');
            return;
        }

        showConfirm('Tem certeza que deseja excluir este Pedido de Venda?', async () => {
            try {
                await SalesOrderService.deleteSalesOrder(id);
                showAlert('Pedido excluído com sucesso.', 'success');
                await ordersRefetch();
                if (onRefresh) await onRefresh();
            } catch (err: any) {
                showAlert(`Erro ao excluir: ${err.message}`, 'error');
            }
        }, 'Excluir Pedido de Venda', 'Excluir', true);
    };

    const toggleSelectAll = () => {
        const pageIds = pagedOrders.map(o => o.id);
        const allSelected = pageIds.length > 0 && pageIds.every(id => selectedOrderIds.includes(id));
        if (allSelected) {
            setSelectedOrderIds(prev => prev.filter(id => !pageIds.includes(id)));
        } else {
            setSelectedOrderIds(prev => Array.from(new Set([...prev, ...pageIds])));
        }
    };

    const getStatusBadge = (status: SalesOrderStatus) => {
        switch (String(status || '').toUpperCase()) {
            case 'CONCLUIDO':
                return { bg: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: 'Concluído' };
            case 'FATURADO':
                return { bg: 'bg-indigo-50 text-indigo-700 border-indigo-200', label: 'Faturado' };
            case 'CANCELADO':
                return { bg: 'bg-rose-50 text-rose-700 border-rose-200', label: 'Cancelado' };
            case 'PENDENTE':
            case 'RASCUNHO':
            default:
                return { bg: 'bg-amber-50 text-amber-700 border-amber-200', label: 'Pendente' };
        }
    };

    // Obtém o prefixo identificador da venda (ex: PVD-001000) para nomear o documento na impressão/PDF
    const getPrintDocumentTitle = useCallback(() => {
        if (!viewOrder) return 'PVD';
        const rawPrefix = (viewOrder.displayId || viewOrder.id?.slice(0, 8) || 'PVD')
            .replace(/^#/, '')
            .trim();
        const orderPrefix = rawPrefix.toUpperCase().startsWith('PVD') || rawPrefix.toUpperCase().startsWith('PV') || rawPrefix.includes('-')
            ? rawPrefix
            : `PVD-${rawPrefix}`;
        return orderPrefix;
    }, [viewOrder]);

    // Mantém o título do documento/aba sincronizado com o prefixo da venda para que o PDF seja salvo com esse nome
    useEffect(() => {
        if (!isViewModalOpen || !viewOrder) return;
        const originalTitle = document.title;
        const printTitle = getPrintDocumentTitle();
        document.title = printTitle;

        const handleBeforePrint = () => {
            document.title = getPrintDocumentTitle();
        };

        window.addEventListener('beforeprint', handleBeforePrint);

        return () => {
            document.title = originalTitle;
            window.removeEventListener('beforeprint', handleBeforePrint);
        };
    }, [isViewModalOpen, viewOrder, getPrintDocumentTitle]);

    const handlePrintA4 = () => {
        const printTitle = getPrintDocumentTitle();
        document.title = printTitle;
        window.print();
    };

    const hasReadAccess = isAdmin || can('sales_orders', 'read') || canAccessMenu('sales_orders');

    if (!hasReadAccess) {
        return (
            <div className="flex flex-col items-center justify-center h-full w-full bg-slate-50 p-8 text-center font-poppins">
                <div className="max-w-md mx-auto">
                    <div className="w-20 h-20 bg-rose-50 border-2 border-rose-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
                        <ShieldOff size={36} className="text-rose-400" />
                    </div>
                    <h1 className="text-xl font-bold text-slate-800 tracking-tight mb-2">
                        Acesso Restrito aos Pedidos de Venda
                    </h1>
                    <p className="text-sm text-slate-500 leading-relaxed mb-8">
                        Seu grupo de usuário não possui permissão para consultar ou gerenciar Pedidos de Venda (PVD). Entre em contato com o administrador da sua empresa para solicitar liberação.
                    </p>
                    <div className="mt-4 inline-flex items-center gap-2 bg-rose-50 border border-rose-100 rounded-xl px-4 py-2">
                        <ShieldOff size={12} className="text-rose-400" />
                        <span className="text-[10px] font-bold text-rose-500 uppercase tracking-widest">
                            Permissão negada pelo grupo de acesso
                        </span>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="p-4 flex flex-col h-full bg-slate-50/20 overflow-hidden font-poppins">
            {/* ── Top Bar & Actions ── */}
            <div className="mb-2 sm:mb-4 p-2 sm:p-3 rounded-2xl border border-[#1c2d4f]/20 bg-white/40 shadow-sm backdrop-blur-md flex flex-col gap-3">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div className="p-2 sm:p-2.5 bg-[#1c2d4f]/10 text-[#1c2d4f] rounded-xl shrink-0">
                            <ShoppingBag size={20} />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h1 className="text-sm sm:text-base font-bold text-slate-800 tracking-tight">Pedidos de Venda</h1>
                                <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-bold">
                                    {totalOrders}
                                </span>
                            </div>
                            <p className="text-[10px] text-slate-400">Emissão de pedidos, baixa de estoque e integração direta com o faturamento</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap justify-end">
                        {canCreate('sales_orders') && (
                            <button
                                onClick={handleOpenCreateModal}
                                className="inline-flex items-center gap-1.5 px-3 py-2 bg-[#1c2d4f] hover:bg-[#253a66] text-white rounded-xl text-xs font-semibold shadow-sm hover:shadow transition-all duration-200 active:scale-95"
                            >
                                <Plus size={15} /> Novo Pedido de Venda
                            </button>
                        )}
                        <button
                            onClick={() => setShowFilters(!showFilters)}
                            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
                                showFilters ? 'bg-[#1c2d4f]/10 border-[#1c2d4f]/30 text-[#1c2d4f]' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                            }`}
                        >
                            <Filter size={15} /> Filtros
                        </button>
                        <button
                            onClick={handleManualRefresh}
                            disabled={isManualSyncing || ordersFetching}
                            className="p-2 bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl transition-all shadow-sm"
                            title="Sincronizar Dados"
                        >
                            <RefreshCw size={15} className={isManualSyncing || ordersFetching ? 'animate-spin text-[#1c2d4f]' : ''} />
                        </button>
                    </div>
                </div>

                {/* ── Barra de Filtros Expansível ── */}
                {showFilters && (
                    <div className="pt-2 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                        <div className="relative">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Buscar por cliente, pedido..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-700 outline-none focus:border-[#1c2d4f]"
                            />
                        </div>
                        <div>
                            <select
                                value={statusFilter}
                                onChange={e => setStatusFilter(e.target.value)}
                                className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-700 outline-none focus:border-[#1c2d4f] cursor-pointer"
                            >
                                <option value="ALL">Todos os Status</option>
                                <option value="PENDENTE">🟡 Pendente (Em Aberto)</option>
                                <option value="CONCLUIDO">🟢 Concluído (No Financeiro)</option>
                                <option value="FATURADO">🔵 Faturado</option>
                                <option value="CANCELADO">🔴 Cancelado</option>
                            </select>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <input
                                type="date"
                                value={startDate}
                                onChange={e => setStartDate(e.target.value)}
                                className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-xl text-[11px] font-medium text-slate-700 outline-none focus:border-[#1c2d4f]"
                            />
                            <span className="text-slate-400 text-xs">até</span>
                            <input
                                type="date"
                                value={endDate}
                                onChange={e => setEndDate(e.target.value)}
                                className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-xl text-[11px] font-medium text-slate-700 outline-none focus:border-[#1c2d4f]"
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* ── Tabela Padronizada ── */}
            <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
                <div className="flex-1 overflow-x-auto overflow-y-auto custom-scrollbar">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-slate-50/80 sticky top-0 z-10 border-b border-slate-200">
                            <tr className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                <th className="px-2.5 py-3 w-8 text-center">
                                    <input
                                        type="checkbox"
                                        checked={pagedOrders.length > 0 && pagedOrders.every(o => selectedOrderIds.includes(o.id))}
                                        onChange={toggleSelectAll}
                                        className="rounded border-slate-300 text-[#1c2d4f] cursor-pointer"
                                    />
                                </th>
                                <th className="px-2.5 py-3 w-28 whitespace-nowrap">Código</th>
                                <th className="px-2.5 py-3 min-w-[140px]">Cliente</th>
                                <th className="px-2.5 py-3 min-w-[150px]">Objeto / Título</th>
                                <th className="px-2.5 py-3 w-28 whitespace-nowrap">Valor Total</th>
                                <th className="px-2.5 py-3 w-28 whitespace-nowrap">Pagamento</th>
                                <th className="px-2.5 py-3 w-24 text-center whitespace-nowrap">Data Criação</th>
                                <th className="px-2.5 py-3 w-24 text-center whitespace-nowrap">Data Concluído</th>
                                <th className="px-2.5 py-3 w-24 text-center whitespace-nowrap">Status</th>
                                <th className="px-2.5 py-3 w-28 text-right whitespace-nowrap">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-xs">
                            {ordersLoading ? (
                                <tr>
                                    <td colSpan={10} className="text-center py-12">
                                        <Loader2 size={24} className="animate-spin text-[#1c2d4f] mx-auto mb-2" />
                                        <p className="text-xs text-slate-400">Carregando pedidos de venda...</p>
                                    </td>
                                </tr>
                            ) : pagedOrders.length === 0 ? (
                                <tr>
                                    <td colSpan={10} className="text-center py-12">
                                        <ShoppingBag size={32} className="text-slate-300 mx-auto mb-2" />
                                        <p className="text-xs font-semibold text-slate-600">Nenhum pedido de venda encontrado</p>
                                        <p className="text-[11px] text-slate-400 mt-0.5">Clique em "Novo Pedido de Venda" para iniciar uma emissão.</p>
                                    </td>
                                </tr>
                            ) : (
                                pagedOrders.map(order => {
                                    const badge = getStatusBadge(order.status);
                                    return (
                                        <tr
                                            key={order.id}
                                            onClick={() => handleViewOrder(order)}
                                            className="hover:bg-slate-50/70 transition-colors group cursor-pointer"
                                            title="Clique para visualizar o pedido completo"
                                        >
                                            <td className="px-2.5 py-2.5 text-center" onClick={e => e.stopPropagation()}>
                                                <input
                                                    type="checkbox"
                                                    checked={selectedOrderIds.includes(order.id)}
                                                    onChange={() => {
                                                        setSelectedOrderIds(prev =>
                                                            prev.includes(order.id) ? prev.filter(id => id !== order.id) : [...prev, order.id]
                                                        );
                                                    }}
                                                    className="rounded border-slate-300 text-[#1c2d4f] cursor-pointer"
                                                />
                                            </td>
                                            <td className="px-2.5 py-2.5 whitespace-nowrap">
                                                <span className="font-mono font-bold text-[11px] px-2 py-0.5 rounded-md bg-amber-50 text-amber-900 border border-amber-200">
                                                    {order.displayId || `#${order.id.slice(0, 8).toUpperCase()}`}
                                                </span>
                                            </td>
                                            <td className="px-2.5 py-2.5 font-semibold text-slate-800 truncate max-w-[160px]" title={order.customerName}>
                                                {order.customerName}
                                            </td>
                                            <td className="px-2.5 py-2.5 text-slate-600 truncate max-w-[180px]" title={order.title}>
                                                {order.title}
                                            </td>
                                            <td className="px-2.5 py-2.5 font-bold text-slate-900 whitespace-nowrap">
                                                R$ {Number(order.totalValue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                            </td>
                                            <td className="px-2.5 py-2.5 text-slate-600 whitespace-nowrap uppercase text-[11px]">
                                                {order.paymentMethod || 'Pix'}
                                                {order.installments && order.installments > 1 ? ` (${order.installments}x)` : ''}
                                            </td>
                                            <td className="px-2.5 py-2.5 text-slate-500 whitespace-nowrap text-center text-[11px]">
                                                {order.createdAt ? new Date(order.createdAt).toLocaleDateString('pt-BR') : '-'}
                                            </td>
                                            <td className="px-2.5 py-2.5 text-slate-500 whitespace-nowrap text-center text-[11px]">
                                                {(() => {
                                                    const rawStatus = String(order.status || '').toUpperCase();
                                                    const isCompleted = rawStatus === 'CONCLUIDO' || rawStatus === 'FATURADO';
                                                    const dateVal = isCompleted ? (order.completedAt || order.updatedAt) : null;
                                                    return dateVal ? (
                                                        <span className="text-emerald-700 font-semibold">
                                                            {new Date(dateVal).toLocaleDateString('pt-BR')}
                                                        </span>
                                                    ) : (
                                                        <span className="text-slate-300 font-mono">-</span>
                                                    );
                                                })()}
                                            </td>
                                            <td className="px-2.5 py-2.5 text-center whitespace-nowrap">
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${badge.bg}`}>
                                                    {badge.label}
                                                </span>
                                            </td>
                                            <td className="px-2.5 py-2.5 text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
                                                <div className="flex items-center justify-end gap-1.5">
                                                    {/* Botão Finalizar Venda (Apenas para Pedidos Pendentes) */}
                                                    {(String(order.status || '').toUpperCase() === 'PENDENTE' || String(order.status || '').toUpperCase() === 'RASCUNHO') && canEdit('sales_orders') && (
                                                        <button
                                                            onClick={() => handleFinalizeOrder(order)}
                                                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold shadow-xs hover:shadow transition-all active:scale-95"
                                                            title="Finalizar Pedido (Concluir venda, baixar estoque e enviar ao Financeiro)"
                                                        >
                                                            <CheckCircle size={13} />
                                                            <span>Finalizar</span>
                                                        </button>
                                                    )}

                                                    {/* Imprimir / Salvar em PDF (Modelo A4) */}
                                                    <button
                                                        onClick={() => { setViewOrder(order); setIsViewModalOpen(true); }}
                                                        className="p-1.5 text-slate-400 hover:text-primary-700 hover:bg-primary-50 rounded-lg transition-all"
                                                        title="Imprimir / Salvar em PDF (Modelo A4)"
                                                    >
                                                        <Printer size={15} />
                                                    </button>

                                                    {/* Editar Pedido (Apenas se Pendente) */}
                                                    {canEdit('sales_orders') && (
                                                        (String(order.status || '').toUpperCase() === 'PENDENTE' || String(order.status || '').toUpperCase() === 'RASCUNHO') ? (
                                                            <button
                                                                onClick={() => handleEditOrder(order)}
                                                                className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-all"
                                                                title="Editar Pedido"
                                                            >
                                                                <Edit3 size={15} />
                                                            </button>
                                                        ) : (
                                                            <span
                                                                className="p-1.5 text-slate-300 cursor-not-allowed"
                                                                title="Pedido Concluído (Bloqueado para alterações)"
                                                            >
                                                                <Lock size={14} />
                                                            </span>
                                                        )
                                                    )}

                                                    {/* Excluir Pedido */}
                                                    {canDelete('sales_orders') && (
                                                        <button
                                                            onClick={() => handleDeleteOrder(order.id)}
                                                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                                                            title="Excluir Pedido"
                                                        >
                                                            <Trash2 size={15} />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* ── Paginação ── */}
                <div className="p-3 border-t border-slate-200 bg-slate-50/50 flex justify-between items-center text-xs">
                    <span className="text-slate-500 font-medium">
                        Página {currentPage} de {totalPages} ({totalOrders} registros)
                    </span>
                    <Pagination
                        currentPage={currentPage}
                        totalPages={totalPages}
                        onPageChange={page => setCurrentPage(page)}
                    />
                </div>
            </div>

            {/* ── Modal de Criação / Edição do Pedido (Tamanho Padrão OS / Sem Abas / PDV Comercial) ── */}
            {isModalOpen && createPortal(
                <div className="fixed inset-0 z-[1200] flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-sm overflow-hidden animate-in fade-in">
                    <div className="bg-white rounded-t-2xl md:rounded-2xl w-full max-w-[1400px] h-[95vh] md:h-[92vh] shadow-2xl flex flex-col overflow-hidden border border-slate-200">
                        {/* ── Modal Header ── */}
                        <div className="px-6 py-3.5 border-b border-slate-200 flex justify-between items-center bg-white shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 bg-amber-50 text-amber-800 rounded-xl border border-amber-200/60">
                                    <ShoppingBag size={22} />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-base font-bold text-slate-900">
                                            {isReadOnly
                                                ? (selectedOrder ? `Pedido #${selectedOrder.displayId || 'PVD-...'}` : 'Visualização do Pedido')
                                                : (selectedOrder ? `Editar Pedido #${selectedOrder.displayId || 'PVD-...'}` : 'Novo Pedido de Venda')}
                                        </h3>
                                        {isReadOnly ? (
                                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-300">
                                                MODO VISUALIZAÇÃO
                                            </span>
                                        ) : (
                                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                                PDV COMERCIAL
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs text-slate-500">
                                        {isReadOnly
                                            ? 'Visualização detalhada dos itens, valores e condições do pedido'
                                            : 'Emissão de pedidos com baixa de estoque e integração direta ao Financeiro'}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2.5">
                                {/* Botão de alternar para edição dentro da tela de visualização */}
                                {isReadOnly && selectedOrder && (String(selectedOrder.status || '').toUpperCase() === 'PENDENTE' || String(selectedOrder.status || '').toUpperCase() === 'RASCUNHO') && canEdit('sales_orders') && (
                                    <button
                                        type="button"
                                        onClick={handleSwitchToEdit}
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#1c2d4f] hover:bg-[#253a66] text-white rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95"
                                        title="Habilitar modo de edição"
                                    >
                                        <Edit3 size={14} />
                                        <span>Editar Pedido</span>
                                    </button>
                                )}

                                {/* Indicador de Status do Pedido (Não editável manualmente) */}
                                <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
                                    <span className="text-[11px] font-bold text-slate-500 uppercase">Status:</span>
                                    {selectedOrder ? (
                                        String(selectedOrder.status || '').toUpperCase() === 'CONCLUIDO' ? (
                                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                                <CheckCircle size={12} /> Concluído (Bloqueado)
                                            </span>
                                        ) : String(selectedOrder.status || '').toUpperCase() === 'FATURADO' ? (
                                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-300">
                                                Faturado
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                                                <Clock size={12} /> Pendente (Em Aberto)
                                            </span>
                                        )
                                    ) : (
                                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                                            <Clock size={12} /> Pendente (Inicial)
                                        </span>
                                    )}
                                </div>
                                <button
                                    onClick={() => setIsModalOpen(false)}
                                    className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                                >
                                    <X size={20} />
                                </button>
                            </div>
                        </div>

                        {/* ── Modal Content (Visão Única Sem Abas - Fluxo PDV) ── */}
                        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 bg-slate-50/50 custom-scrollbar">

                            {/* ── BLOCO 1: DADOS DO CLIENTE & INFORMAÇÕES DA VENDA ── */}
                            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                                    <div className="flex items-center gap-2">
                                        <User size={18} className="text-[#1c2d4f]" />
                                        <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                                            1. Identificação do Cliente & Dados da Venda
                                        </h4>
                                    </div>
                                    {!isReadOnly && selectedCustomer && (
                                        <button
                                            type="button"
                                            onClick={handleClearCustomer}
                                            className="text-[11px] font-semibold text-rose-600 hover:underline"
                                        >
                                            Desvincular / Digitar Cliente Avulso
                                        </button>
                                    )}
                                </div>

                                {/* Busca de Cliente Cadastrado com Dropdown Autocomplete (Apenas em Edição/Criação) */}
                                {!isReadOnly && (
                                    <div className="relative" ref={clientDropdownRef}>
                                        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                                            Buscar Cliente Cadastrado (Razão Social, Nome Fantasia, CPF/CNPJ, Telefone)
                                        </label>
                                        <div className="relative">
                                            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                            <input
                                                type="text"
                                                placeholder="Digite para pesquisar na base de clientes..."
                                                value={clientSearch}
                                                onChange={e => {
                                                    setClientSearch(e.target.value);
                                                    setIsClientListOpen(true);
                                                }}
                                                onFocus={() => setIsClientListOpen(true)}
                                                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 outline-none focus:border-[#1c2d4f] focus:bg-white transition-all"
                                            />
                                            {clientSearch && (
                                                <button
                                                    type="button"
                                                    onClick={() => { setClientSearch(''); setIsClientListOpen(false); }}
                                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                                >
                                                    <X size={14} />
                                                </button>
                                            )}
                                        </div>

                                        {/* Dropdown de Clientes */}
                                        {isClientListOpen && filteredClients.length > 0 && (
                                            <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-2xl z-30 max-h-56 overflow-y-auto divide-y divide-slate-100">
                                                {filteredClients.map(c => (
                                                    <div
                                                        key={c.id}
                                                        onMouseDown={() => handleSelectCustomer(c)}
                                                        className="p-3 hover:bg-slate-50 cursor-pointer flex justify-between items-center transition-colors"
                                                    >
                                                        <div>
                                                            <p className="font-bold text-xs text-slate-800">{c.name}</p>
                                                            <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                                                                {c.document && <span>Doc: {c.document}</span>}
                                                                {(c.phone || c.whatsapp) && <span>• Tel: {c.whatsapp || c.phone}</span>}
                                                                {c.city && <span>• {c.city}/{c.state}</span>}
                                                            </div>
                                                        </div>
                                                        <span className="px-2 py-1 bg-primary-50 text-[#1c2d4f] rounded-lg text-[10px] font-bold">
                                                            Selecionar
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Campos de Dados do Cliente */}
                                <div className="grid grid-cols-1 md:grid-cols-12 gap-3 pt-1">
                                    <div className="md:col-span-5">
                                        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                                            Nome do Cliente / Razão Social *
                                        </label>
                                        <input
                                            type="text"
                                            value={customerName}
                                            readOnly={isReadOnly}
                                            onChange={e => setCustomerName(e.target.value)}
                                            placeholder="Nome completo ou Razão Social..."
                                            className={`w-full px-3 py-2 border rounded-xl text-xs font-semibold outline-none transition-all ${isReadOnly ? 'bg-slate-100/70 border-slate-200 text-slate-800 cursor-default' : 'bg-slate-50 border-slate-200 text-slate-800 focus:border-[#1c2d4f] focus:bg-white'}`}
                                        />
                                    </div>
                                    <div className="md:col-span-3">
                                        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                                            CPF / CNPJ
                                        </label>
                                        <input
                                            type="text"
                                            value={customerDocument}
                                            readOnly={isReadOnly}
                                            onChange={e => setCustomerDocument(e.target.value)}
                                            placeholder="000.000.000-00"
                                            className={`w-full px-3 py-2 border rounded-xl text-xs font-medium outline-none transition-all ${isReadOnly ? 'bg-slate-100/70 border-slate-200 text-slate-800 cursor-default' : 'bg-slate-50 border-slate-200 text-slate-800 focus:border-[#1c2d4f] focus:bg-white'}`}
                                        />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                                            Telefone / WhatsApp
                                        </label>
                                        <input
                                            type="text"
                                            value={customerPhone}
                                            readOnly={isReadOnly}
                                            onChange={e => setCustomerPhone(e.target.value)}
                                            placeholder="(00) 00000-0000"
                                            className={`w-full px-3 py-2 border rounded-xl text-xs font-medium outline-none transition-all ${isReadOnly ? 'bg-slate-100/70 border-slate-200 text-slate-800 cursor-default' : 'bg-slate-50 border-slate-200 text-slate-800 focus:border-[#1c2d4f] focus:bg-white'}`}
                                        />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                                            E-mail
                                        </label>
                                        <input
                                            type="email"
                                            value={customerEmail}
                                            readOnly={isReadOnly}
                                            onChange={e => setCustomerEmail(e.target.value)}
                                            placeholder="cliente@email.com"
                                            className={`w-full px-3 py-2 border rounded-xl text-xs font-medium outline-none transition-all ${isReadOnly ? 'bg-slate-100/70 border-slate-200 text-slate-800 cursor-default' : 'bg-slate-50 border-slate-200 text-slate-800 focus:border-[#1c2d4f] focus:bg-white'}`}
                                        />
                                    </div>
                                </div>

                                {/* Endereço Completo & Detalhes da Venda */}
                                <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                                    <div className="md:col-span-6">
                                        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                                            Endereço Completo de Entrega
                                        </label>
                                        <input
                                            type="text"
                                            value={customerAddress}
                                            readOnly={isReadOnly}
                                            onChange={e => setCustomerAddress(e.target.value)}
                                            placeholder="Rua, número, bairro, cidade/UF..."
                                            className={`w-full px-3 py-2 border rounded-xl text-xs font-medium outline-none transition-all ${isReadOnly ? 'bg-slate-100/70 border-slate-200 text-slate-800 cursor-default' : 'bg-slate-50 border-slate-200 text-slate-800 focus:border-[#1c2d4f] focus:bg-white'}`}
                                        />
                                    </div>
                                    <div className="md:col-span-4">
                                        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                                            Título / Referência da Venda *
                                        </label>
                                        <input
                                            type="text"
                                            value={title}
                                            readOnly={isReadOnly}
                                            onChange={e => setTitle(e.target.value)}
                                            placeholder="Ex: Venda de Peças de Reposição e Filtros"
                                            className={`w-full px-3 py-2 border rounded-xl text-xs font-semibold outline-none transition-all ${isReadOnly ? 'bg-slate-100/70 border-slate-200 text-slate-800 cursor-default' : 'bg-slate-50 border-slate-200 text-slate-800 focus:border-[#1c2d4f] focus:bg-white'}`}
                                        />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                                            Vendedor / Emissor
                                        </label>
                                        <div className="px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 truncate">
                                            {selectedOrder?.createdByName || auth.user?.name || auth.user?.email?.split('@')[0] || 'Vendedor'}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* ── BLOCO 2: TABELA DE ITENS, ESTOQUE E ADIÇÃO RÁPIDA ── */}
                            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                                    <div className="flex items-center gap-2">
                                        <Package size={18} className="text-[#1c2d4f]" />
                                        <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                                            2. Itens do Pedido & Produtos do Estoque
                                        </h4>
                                    </div>
                                    <span className="text-xs text-slate-500 font-semibold">
                                        {items.length} {items.length === 1 ? 'item adicionado' : 'itens adicionados'}
                                    </span>
                                </div>

                                {/* Barra de Inserção Rápida de Itens (PDV) - Apenas em modo Edição/Criação */}
                                {!isReadOnly && (
                                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                                        {/* Alternador de Tipo: Peça do Estoque vs Item Avulso */}
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <span className="text-[11px] font-bold text-slate-500 uppercase">Origem do Item:</span>
                                                <div className="inline-flex bg-white p-1 rounded-lg border border-slate-200 text-xs">
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setItemType('stock');
                                                            setSelectedStockItem(null);
                                                            setStockSearchTerm('');
                                                        }}
                                                        className={`px-3 py-1 rounded-md font-bold transition-all ${itemType === 'stock' ? 'bg-[#1c2d4f] text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                                                    >
                                                        📦 Peça do Estoque
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setItemType('manual');
                                                            setSelectedStockItem(null);
                                                        }}
                                                        className={`px-3 py-1 rounded-md font-bold transition-all ${itemType === 'manual' ? 'bg-[#1c2d4f] text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                                                    >
                                                        ✏️ Item Avulso / Manual
                                                    </button>
                                                </div>
                                            </div>
                                            <span className="text-[11px] text-slate-400">
                                                {itemType === 'stock' ? 'Dá baixa automática do saldo no estoque' : 'Item não vinculado à grade de estoque'}
                                            </span>
                                        </div>

                                        {/* Inputs da Barra Rápida */}
                                        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                                            {itemType === 'stock' ? (
                                                <div className="md:col-span-6 relative" ref={stockDropdownRef}>
                                                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                                                        Buscar Produto no Estoque (Nome, Código SKU, Código Interno ou Barras)
                                                    </label>
                                                    <div className="relative">
                                                        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                                        <input
                                                            type="text"
                                                            placeholder="Digite nome, código, cód. interno ou bipe o código de barras..."
                                                            value={stockSearchTerm}
                                                            onChange={e => {
                                                                setStockSearchTerm(e.target.value);
                                                                setIsStockDropdownOpen(true);
                                                            }}
                                                            onFocus={() => setIsStockDropdownOpen(true)}
                                                            className="w-full pl-9 pr-8 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 outline-none focus:border-[#1c2d4f]"
                                                        />
                                                        {isSearchingDb ? (
                                                            <Loader2 size={14} className="animate-spin text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                                                        ) : (
                                                            stockSearchTerm && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setStockSearchTerm('');
                                                                        setSelectedStockItem(null);
                                                                    }}
                                                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                                                >
                                                                    <X size={14} />
                                                                </button>
                                                            )
                                                        )}
                                                    </div>

                                                    {/* Dropdown de Peças do Estoque */}
                                                    {isStockDropdownOpen && (
                                                        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-2xl z-30 max-h-60 overflow-y-auto divide-y divide-slate-100">
                                                            {filteredStockItems.length === 0 ? (
                                                                <div className="p-4 text-center text-slate-400 text-xs">
                                                                    {isSearchingDb ? (
                                                                        <div className="flex items-center justify-center gap-2">
                                                                            <Loader2 size={14} className="animate-spin text-slate-400" />
                                                                            <span>Pesquisando no catálogo de estoque...</span>
                                                                        </div>
                                                                    ) : (
                                                                        <span>Nenhum item encontrado por nome, código ou barras.</span>
                                                                    )}
                                                                </div>
                                                            ) : (
                                                                filteredStockItems.map(s => (
                                                                    <div
                                                                        key={s.id}
                                                                        onMouseDown={() => handleSelectStockItem(s)}
                                                                        className="p-2.5 hover:bg-slate-50 cursor-pointer flex justify-between items-center text-xs transition-colors"
                                                                    >
                                                                        <div className="min-w-0 pr-3">
                                                                            <p className="font-bold text-slate-800 truncate">{s.description}</p>
                                                                            <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500 font-mono mt-0.5">
                                                                                {s.code && (
                                                                                    <span className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200">
                                                                                        Cód: {s.code}
                                                                                    </span>
                                                                                )}
                                                                                {s.externalCode && (
                                                                                    <span className="bg-amber-50 text-amber-800 px-1.5 py-0.5 rounded border border-amber-200">
                                                                                        Barras/Interno: {s.externalCode}
                                                                                    </span>
                                                                                )}
                                                                                <span className="text-slate-400">• Saldo: {s.quantity} {s.unit || 'un'}</span>
                                                                                {s.category && <span className="text-slate-400">• {s.category}</span>}
                                                                            </div>
                                                                        </div>
                                                                        <div className="text-right shrink-0">
                                                                            <span className="text-xs font-bold text-emerald-600 block">
                                                                                R$ {Number(s.sellPrice || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                                            </span>
                                                                            <span className="text-[9px] text-slate-400">unitário</span>
                                                                        </div>
                                                                    </div>
                                                                ))
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <>
                                                    <div className="md:col-span-4">
                                                        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                                                            Descrição do Produto / Serviço *
                                                        </label>
                                                        <input
                                                            type="text"
                                                            placeholder="Ex: Mão de obra de instalação, peça sob encomenda..."
                                                            value={manualDescription}
                                                            onChange={e => setManualDescription(e.target.value)}
                                                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 outline-none focus:border-[#1c2d4f]"
                                                        />
                                                    </div>
                                                    <div className="md:col-span-2">
                                                        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                                                            Cód / Ref (Opcional)
                                                        </label>
                                                        <input
                                                            type="text"
                                                            placeholder="Ex: REF-99"
                                                            value={manualCode}
                                                            onChange={e => setManualCode(e.target.value)}
                                                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono text-slate-800 outline-none focus:border-[#1c2d4f]"
                                                        />
                                                    </div>
                                                </>
                                            )}

                                            {/* Quantidade */}
                                            <div className="md:col-span-2">
                                                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                                                    Quantidade
                                                </label>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    value={itemQuantity}
                                                    onChange={e => setItemQuantity(e.target.value)}
                                                    onFocus={e => e.target.select()}
                                                    onBlur={e => {
                                                        const val = Number(String(e.target.value).replace(',', '.'));
                                                        if (isNaN(val) || val <= 0) {
                                                            setItemQuantity(1);
                                                        }
                                                    }}
                                                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 text-center outline-none focus:border-[#1c2d4f]"
                                                />
                                            </div>

                                            {/* Preço Unitário (R$) */}
                                            <div className="md:col-span-2">
                                                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                                                    Preço Unitário (R$)
                                                </label>
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    min="0"
                                                    value={itemUnitPrice}
                                                    onChange={e => setItemUnitPrice(e.target.value)}
                                                    onFocus={e => e.target.select()}
                                                    onBlur={e => {
                                                        const val = Number(String(e.target.value).replace(',', '.'));
                                                        if (isNaN(val) || val < 0) {
                                                            setItemUnitPrice(0);
                                                        }
                                                    }}
                                                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 text-right outline-none focus:border-[#1c2d4f]"
                                                />
                                            </div>

                                            {/* Botão Adicionar Item */}
                                            <div className="md:col-span-2">
                                                <button
                                                    type="button"
                                                    onClick={handleAddQuickItem}
                                                    className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-[#1c2d4f] hover:bg-[#253a66] text-white rounded-xl text-xs font-bold shadow-sm transition-all"
                                                >
                                                    <Plus size={16} /> Adicionar Item
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Tabela Padrão do Sistema de Itens do Pedido */}
                                <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
                                    <table className="w-full text-left border-collapse text-xs">
                                        <thead className="bg-slate-100/80 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase">
                                            <tr>
                                                <th className="px-3 py-3 w-12 text-center">#</th>
                                                <th className="px-3 py-3 w-28">Tipo</th>
                                                <th className="px-3 py-3 w-28">Cód / Ref</th>
                                                <th className="px-3 py-3">Descrição do Produto / Peça</th>
                                                <th className="px-3 py-3 w-32 text-center">Quantidade</th>
                                                <th className="px-3 py-3 w-36 text-right">Unitário (R$)</th>
                                                <th className="px-3 py-3 w-36 text-right">Subtotal (R$)</th>
                                                {!isReadOnly && <th className="px-3 py-3 w-16 text-center">Ações</th>}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {items.length === 0 ? (
                                                <tr>
                                                    <td colSpan={isReadOnly ? 7 : 8} className="py-10 text-center text-slate-400">
                                                        <div className="flex flex-col items-center justify-center gap-2">
                                                            <div className="p-3 bg-slate-100 text-slate-400 rounded-full">
                                                                <ShoppingBag size={24} />
                                                            </div>
                                                            <p className="font-semibold text-xs text-slate-600">Nenhum produto adicionado ao pedido</p>
                                                            <p className="text-[11px] text-slate-400">
                                                                {!isReadOnly ? 'Utilize a barra rápida acima para buscar peças no estoque ou adicionar itens avulsos.' : 'Este pedido não possui itens registrados.'}
                                                            </p>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ) : (
                                                items.map((item, idx) => (
                                                    <tr key={item.id || idx} className="hover:bg-slate-50/60 transition-colors">
                                                        <td className="px-3 py-3 text-center text-slate-400 font-mono text-[11px]">
                                                            {idx + 1}
                                                        </td>
                                                        <td className="px-3 py-3">
                                                            {item.stockItemId ? (
                                                                 <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                                    <Package size={11} /> Estoque
                                                                </span>
                                                            ) : (
                                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-50 text-sky-700 border border-sky-200">
                                                                    <Edit3 size={11} /> Manual
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="px-3 py-3 font-mono text-slate-500 text-[11px]">
                                                            {item.stockCode || '-'}
                                                        </td>
                                                        <td className="px-3 py-3 font-semibold text-slate-800">
                                                            {item.description}
                                                        </td>
                                                        <td className="px-3 py-3 text-center">
                                                            {isReadOnly ? (
                                                                <span className="inline-block px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800 font-bold text-xs">
                                                                    {item.quantity}
                                                                </span>
                                                            ) : (
                                                                <div className="inline-flex items-center border border-slate-200 rounded-lg overflow-hidden bg-white shadow-xs">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => {
                                                                            const curQty = Number(String(item.quantity).replace(',', '.')) || 1;
                                                                            updateItem(idx, { quantity: Math.max(1, curQty - 1) });
                                                                        }}
                                                                        className="px-2 py-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                                                                    >
                                                                        <Minus size={12} />
                                                                    </button>
                                                                    <input
                                                                        type="number"
                                                                        min="1"
                                                                        value={item.quantity ?? ''}
                                                                        onChange={e => updateItem(idx, { quantity: e.target.value })}
                                                                        onFocus={e => e.target.select()}
                                                                        onBlur={e => {
                                                                            const val = Number(String(e.target.value).replace(',', '.'));
                                                                            if (isNaN(val) || val <= 0) {
                                                                                updateItem(idx, { quantity: 1 });
                                                                            }
                                                                        }}
                                                                        className="w-12 text-center text-xs font-bold text-slate-800 outline-none"
                                                                    />
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => {
                                                                            const curQty = Number(String(item.quantity).replace(',', '.')) || 0;
                                                                            updateItem(idx, { quantity: curQty + 1 });
                                                                        }}
                                                                        className="px-2 py-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                                                                    >
                                                                        <Plus size={12} />
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td className="px-3 py-3 text-right">
                                                            {isReadOnly ? (
                                                                <span className="text-xs font-semibold text-slate-700">
                                                                    R$ {Number(item.unitPrice || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                                </span>
                                                            ) : (
                                                                <input
                                                                    type="number"
                                                                    step="0.01"
                                                                    min="0"
                                                                    value={item.unitPrice ?? ''}
                                                                    onChange={e => updateItem(idx, { unitPrice: e.target.value })}
                                                                    onFocus={e => e.target.select()}
                                                                    onBlur={e => {
                                                                        const val = Number(String(e.target.value).replace(',', '.'));
                                                                        if (isNaN(val) || val < 0) {
                                                                            updateItem(idx, { unitPrice: 0 });
                                                                        }
                                                                    }}
                                                                    className="w-24 text-right px-2 py-1 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 outline-none focus:border-[#1c2d4f]"
                                                                />
                                                            )}
                                                        </td>
                                                        <td className="px-3 py-3 text-right font-bold text-slate-900 whitespace-nowrap">
                                                            R$ {Number(item.total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                        </td>
                                                        {!isReadOnly && (
                                                            <td className="px-3 py-3 text-center">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => removeItem(idx)}
                                                                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                                                    title="Remover Item"
                                                                >
                                                                    <Trash2 size={15} />
                                                                </button>
                                                            </td>
                                                        )}
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* ── BLOCO 3: INFORMAÇÕES ADICIONAIS, PAGAMENTO E TOTAIS PDV (Rodapé) ── */}
                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">

                                {/* Coluna Esquerda: Informações Adicionais e Condições de Pagamento */}
                                <div className="lg:col-span-7 space-y-4">
                                    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                                        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                                            <FileText size={18} className="text-[#1c2d4f]" />
                                            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                                                3. Informações Adicionais & Observações
                                            </h4>
                                        </div>

                                        {/* Observações Livres */}
                                        <div>
                                            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                                                Observações do Pedido / Notas Comerciais
                                            </label>
                                            <textarea
                                                rows={3}
                                                value={notes}
                                                readOnly={isReadOnly}
                                                onChange={e => setNotes(e.target.value)}
                                                placeholder="Observações da venda, prazo de entrega, garantias, notas para o faturamento, transportadora..."
                                                className={`w-full px-3 py-2 border rounded-xl text-xs font-medium outline-none transition-all resize-none ${isReadOnly ? 'bg-slate-100/70 border-slate-200 text-slate-800 cursor-default' : 'bg-slate-50 border-slate-200 text-slate-800 focus:border-[#1c2d4f] focus:bg-white'}`}
                                            />
                                        </div>

                                        {/* Condições de Pagamento */}
                                        <div className="pt-2 border-t border-slate-100 space-y-3">
                                            <div className="flex items-center gap-2">
                                                <CreditCard size={16} className="text-[#1c2d4f]" />
                                                <h5 className="text-[11px] font-bold text-slate-700 uppercase">
                                                    Forma e Condições de Pagamento
                                                </h5>
                                            </div>

                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                <div>
                                                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                                                        Forma de Pagamento
                                                    </label>
                                                    <select
                                                        value={paymentMethod}
                                                        disabled={isReadOnly}
                                                        onChange={e => setPaymentMethod(e.target.value)}
                                                        className={`w-full px-3 py-2 border rounded-xl text-xs font-bold outline-none ${isReadOnly ? 'bg-slate-100/70 border-slate-200 text-slate-800 cursor-default' : 'bg-slate-50 border-slate-200 text-slate-800 focus:border-[#1c2d4f] cursor-pointer'}`}
                                                    >
                                                        <option value="Pix">Pix (Instantâneo)</option>
                                                        <option value="Dinheiro">Dinheiro</option>
                                                        <option value="Cartão Crédito">Cartão de Crédito</option>
                                                        <option value="Cartão Débito">Cartão de Débito</option>
                                                        <option value="Boleto">Boleto Bancário</option>
                                                        <option value="Faturado">A Prazo / Faturado</option>
                                                        <option value="Transferência">Transferência / TED</option>
                                                    </select>
                                                </div>

                                                <div>
                                                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                                                        Parcelamento
                                                    </label>
                                                    <select
                                                        value={installments}
                                                        disabled={isReadOnly}
                                                        onChange={e => setInstallments(Number(e.target.value))}
                                                        className={`w-full px-3 py-2 border rounded-xl text-xs font-bold outline-none ${isReadOnly ? 'bg-slate-100/70 border-slate-200 text-slate-800 cursor-default' : 'bg-slate-50 border-slate-200 text-slate-800 focus:border-[#1c2d4f] cursor-pointer'}`}
                                                    >
                                                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(n => (
                                                            <option key={n} value={n}>
                                                                {n === 1 ? '1x À Vista' : `${n}x parcelas`} {n > 1 && totalValue > 0 ? `(R$ ${(totalValue / n).toLocaleString('pt-BR', { minimumFractionDigits: 2 })})` : ''}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </div>

                                            <div>
                                                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                                                    Detalhes ou Notas de Pagamento
                                                </label>
                                                <input
                                                    type="text"
                                                    value={paymentNotes}
                                                    readOnly={isReadOnly}
                                                    onChange={e => setPaymentNotes(e.target.value)}
                                                    placeholder="Ex: 50% de entrada no Pix, saldo em 30 dias..."
                                                    className={`w-full px-3 py-2 border rounded-xl text-xs font-medium outline-none transition-all ${isReadOnly ? 'bg-slate-100/70 border-slate-200 text-slate-800 cursor-default' : 'bg-slate-50 border-slate-200 text-slate-800 focus:border-[#1c2d4f] focus:bg-white'}`}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Coluna Direita: Totais Caixa PDV */}
                                <div className="lg:col-span-5">
                                    <div className="bg-slate-100/75 backdrop-blur-md text-slate-800 p-5 rounded-2xl shadow-sm flex flex-col justify-between space-y-4 border border-slate-200/90 h-full">
                                        <div className="space-y-4">
                                            <div className="flex items-center justify-between border-b border-slate-200/80 pb-3">
                                                <div className="flex items-center gap-2">
                                                    <div className="p-1.5 bg-emerald-500/15 text-emerald-700 rounded-lg">
                                                        <DollarSign size={18} />
                                                    </div>
                                                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                                                        Fechamento do Pedido (PDV)
                                                    </h4>
                                                </div>
                                                <span className="text-[11px] font-mono font-semibold text-slate-500 bg-white/80 px-2 py-0.5 rounded-md border border-slate-200/60 shadow-2xs">
                                                    {items.length} {items.length === 1 ? 'item' : 'itens'}
                                                </span>
                                            </div>

                                            {/* Subtotal dos Itens */}
                                            <div className="flex justify-between items-center text-xs">
                                                <span className="text-slate-500 font-medium">Subtotal de Itens:</span>
                                                <span className="text-slate-900 font-bold text-sm">
                                                    R$ {subtotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                </span>
                                            </div>

                                            {/* Frete */}
                                            <div className="flex justify-between items-center text-xs">
                                                <div className="flex items-center gap-1.5 text-slate-600 font-medium">
                                                    <Truck size={14} className="text-amber-500" />
                                                    <span>(+) Frete / Envio:</span>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <span className="text-slate-400 text-xs">R$</span>
                                                    {isReadOnly ? (
                                                        <span className="w-28 px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 text-right shadow-2xs">
                                                            {Number(shipping || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                        </span>
                                                    ) : (
                                                        <input
                                                            type="number"
                                                            step="0.01"
                                                            min="0"
                                                            value={shipping}
                                                            onChange={e => setShipping(e.target.value)}
                                                            onFocus={e => e.target.select()}
                                                            onBlur={e => {
                                                                const val = Number(String(e.target.value).replace(',', '.'));
                                                                if (isNaN(val) || val < 0) {
                                                                    setShipping(0);
                                                                }
                                                            }}
                                                            className="w-28 px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 text-right outline-none focus:border-[#1c2d4f] shadow-2xs"
                                                        />
                                                    )}
                                                </div>
                                            </div>

                                            {/* Desconto */}
                                            <div className="flex justify-between items-center text-xs">
                                                <div className="flex items-center gap-1.5 text-rose-600 font-medium">
                                                    <Percent size={14} className="text-rose-500" />
                                                    <span>(-) Desconto Comercial:</span>
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    {isReadOnly ? (
                                                        <span className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-rose-600 text-right shadow-2xs">
                                                            {Number(discount || 0).toFixed(2)} {discountType === 'percent' ? '%' : 'R$'}
                                                        </span>
                                                    ) : (
                                                        <>
                                                            <input
                                                                type="number"
                                                                step="0.01"
                                                                min="0"
                                                                value={discount}
                                                                onChange={e => setDiscount(e.target.value)}
                                                                onFocus={e => e.target.select()}
                                                                onBlur={e => {
                                                                    const val = Number(String(e.target.value).replace(',', '.'));
                                                                    if (isNaN(val) || val < 0) {
                                                                        setDiscount(0);
                                                                    }
                                                                }}
                                                                className="w-20 px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-rose-600 text-right outline-none focus:border-rose-400 shadow-2xs"
                                                            />
                                                            <select
                                                                value={discountType}
                                                                onChange={e => setDiscountType(e.target.value as any)}
                                                                className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-[11px] font-bold text-slate-700 outline-none cursor-pointer shadow-2xs"
                                                            >
                                                                <option value="fixed">R$ Fixo</option>
                                                                <option value="percent">% Perc.</option>
                                                            </select>
                                                        </>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Linha Divisória */}
                                            <div className="border-t border-slate-200/80 pt-3 space-y-1">
                                                <div className="flex justify-between items-baseline">
                                                    <span className="text-xs uppercase tracking-wider text-slate-600 font-bold">
                                                        Total Geral da Venda:
                                                    </span>
                                                    <div className="text-right">
                                                        <span className="text-xl font-extrabold text-emerald-600 tracking-tight">
                                                            R$ {totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                        </span>
                                                    </div>
                                                </div>
                                                {installments > 1 && totalValue > 0 && (
                                                    <p className="text-[11px] text-right text-slate-500 font-medium">
                                                        Em {installments}x de R$ {(totalValue / installments).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} via {paymentMethod}
                                                    </p>
                                                )}
                                            </div>
                                        </div>

                                        {/* Nota de Integração Estoque & Financeiro */}
                                        <div className="p-3 bg-white/90 rounded-xl border border-slate-200 text-[11px] text-slate-600 space-y-1 shadow-2xs">
                                            <div className="flex items-center gap-1.5 text-emerald-700 font-bold">
                                                <CheckCircle size={14} className="text-emerald-600" />
                                                <span>Fluxo Automático do Pedido</span>
                                            </div>
                                            <p className="text-[10px] text-slate-500 leading-relaxed">
                                                O pedido é iniciado como <strong className="text-amber-600">Pendente</strong> e permite edições. Ao clicar em <strong className="text-emerald-700">Finalizar Venda</strong>, as peças sofrem baixa automática no estoque, o valor entra no Financeiro (Contas a Receber) e o pedido é bloqueado.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* ── Modal Footer Fixo ── */}
                        <div className="px-6 py-3.5 border-t border-slate-200 bg-white flex justify-between items-center shrink-0">
                            <div className="flex items-center gap-3">
                                <span className="text-xs font-bold text-slate-500">
                                    {items.length} {items.length === 1 ? 'item' : 'itens'} no pedido
                                </span>
                                <span className="text-sm font-black text-slate-900">
                                    Total: R$ {totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                {isReadOnly ? (
                                    <>
                                        <button
                                            type="button"
                                            onClick={() => setIsModalOpen(false)}
                                            className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-semibold hover:bg-slate-50 transition-all"
                                        >
                                            Fechar
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (selectedOrder) {
                                                    setViewOrder(selectedOrder);
                                                    setIsViewModalOpen(true);
                                                }
                                            }}
                                            className="inline-flex items-center gap-1.5 px-4 py-2 border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold transition-all shadow-xs"
                                        >
                                            <Printer size={15} />
                                            Imprimir / PDF
                                        </button>
                                        {selectedOrder && (String(selectedOrder.status || '').toUpperCase() === 'PENDENTE' || String(selectedOrder.status || '').toUpperCase() === 'RASCUNHO') && canEdit('sales_orders') && (
                                            <>
                                                <button
                                                    type="button"
                                                    onClick={handleSwitchToEdit}
                                                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#1c2d4f] hover:bg-[#253a66] text-white rounded-xl text-xs font-bold shadow-sm transition-all active:scale-95"
                                                >
                                                    <Edit3 size={15} />
                                                    Editar Pedido
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={handleSaveAndFinalize}
                                                    disabled={loading}
                                                    className="inline-flex items-center gap-1.5 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md transition-all disabled:opacity-50 active:scale-95"
                                                    title="Finalizar agora: dá baixa no estoque e envia para faturamento no Financeiro"
                                                >
                                                    {loading ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle size={15} />}
                                                    Finalizar Venda
                                                </button>
                                            </>
                                        )}
                                    </>
                                ) : (
                                    <>
                                        <button
                                            type="button"
                                            onClick={() => setIsModalOpen(false)}
                                            className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-semibold hover:bg-slate-50 transition-all"
                                        >
                                            Cancelar
                                        </button>
                                        {(selectedOrder ? (isAdmin || canEdit('sales_orders')) : (isAdmin || canCreate('sales_orders'))) && (
                                            <button
                                                type="button"
                                                onClick={handleSaveOrder}
                                                disabled={loading}
                                                className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-700 hover:bg-slate-800 text-white rounded-xl text-xs font-bold shadow-sm transition-all disabled:opacity-50"
                                            >
                                                {loading ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                                                {selectedOrder ? 'Salvar Alterações' : 'Salvar Pedido (Pendente)'}
                                            </button>
                                        )}
                                        {(selectedOrder ? (isAdmin || canEdit('sales_orders')) : (isAdmin || canCreate('sales_orders'))) && (
                                            <button
                                                type="button"
                                                onClick={handleSaveAndFinalize}
                                                disabled={loading}
                                                className="inline-flex items-center gap-1.5 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md transition-all disabled:opacity-50 active:scale-95"
                                                title="Finalizar agora: dá baixa no estoque e envia para faturamento no Financeiro"
                                            >
                                                {loading ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle size={15} />}
                                                Finalizar Venda
                                            </button>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            , document.body)}

            {/* ── Modal de Visualização & Impressão A4 (Idêntico ao Orçamento) ── */}
            {isViewModalOpen && viewOrder && createPortal(
                <div className="fixed inset-0 z-[1300] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-0 sm:p-4 overflow-hidden animate-in fade-in print:p-0 print:bg-white print:fixed print:inset-0">
                    <div className="bg-white rounded-none sm:rounded-2xl w-full max-w-5xl h-full sm:h-[95vh] shadow-2xl flex flex-col overflow-hidden border-0 sm:border border-slate-200 print:border-none print:shadow-none print:h-auto print:rounded-none">
                        {/* Toolbar do Viewer (Oculto na Impressão) */}
                        <div className="px-5 py-3 border-b border-slate-200 flex justify-between items-center bg-white shrink-0 print:hidden">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-[#1c2d4f]/10 text-[#1c2d4f] rounded-lg">
                                    <Printer size={18} />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-sm font-bold text-slate-800">
                                            Pedido de Venda #{viewOrder.displayId || viewOrder.id.slice(0, 8).toUpperCase()}
                                        </h3>
                                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                            DOCUMENTO A4
                                        </span>
                                    </div>
                                    <p className="text-[11px] text-slate-400">Modelo padrão oficial de impressão e exportação em PDF</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={handlePrintA4}
                                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#1c2d4f] hover:bg-[#253a66] text-white rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95 cursor-pointer"
                                    title="Imprimir ou Salvar em PDF"
                                >
                                    <Printer size={14} />
                                    <span>Imprimir / Salvar PDF</span>
                                </button>
                                <button
                                    onClick={() => setIsViewModalOpen(false)}
                                    className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                                    title="Fechar Visualizador"
                                >
                                    <X size={20} />
                                </button>
                            </div>
                        </div>

                        {/* Área de Visualização do Documento A4 com Scroll */}
                        <div className="flex-1 overflow-y-auto p-2 sm:p-6 bg-slate-100/70 custom-scrollbar print:p-0 print:bg-white print:overflow-visible">
                            {/* Folha A4 Centralizada */}
                            <div
                                id="printable-sales-order"
                                className="bg-white text-[10px] leading-relaxed font-poppins p-4 sm:p-6 w-full max-w-[210mm] mx-auto border sm:border-slate-300 sm:rounded-xl shadow-lg sm:shadow-md print:shadow-none print:border-none print:p-0 print:rounded-none"
                                style={{
                                    WebkitPrintColorAdjust: 'exact',
                                    printColorAdjust: 'exact',
                                    boxSizing: 'border-box',
                                    fontFamily: "'Poppins', sans-serif"
                                }}
                            >
                                <style type="text/css" media="print">
                                    {`
                                        @page { size: A4 portrait; margin: 10mm 4mm 15mm 4mm; }
                                        body * {
                                            visibility: hidden;
                                        }
                                        #printable-sales-order, #printable-sales-order * {
                                            visibility: visible;
                                        }
                                        #printable-sales-order {
                                            position: absolute;
                                            left: 0;
                                            top: 0;
                                            width: 100% !important;
                                            margin: 0 !important;
                                            padding: 0 !important;
                                        }
                                    `}
                                </style>

                                {/* Header: Company & Order Info */}
                                <div className="flex justify-between items-start pb-2 border-b-2 border-slate-800 mb-2">
                                    <div className="flex gap-4 items-center">
                                        {resolvedCompanyLogo ? (
                                            <img src={resolvedCompanyLogo} alt="Logo" className="h-16 w-auto max-w-[180px] object-contain" />
                                        ) : (
                                            <div className="bg-slate-900 p-2 rounded-lg flex items-center justify-center min-w-[50px] min-h-[50px] text-white">
                                                <Hexagon size={28} className="text-white fill-white/10" />
                                            </div>
                                        )}
                                        <div className="space-y-0.5">
                                            <h1 className="text-lg font-bold text-slate-900 uppercase tracking-tight">{companyInfo.name}</h1>
                                            <div className="text-[10px] text-slate-600 max-w-[400px]">
                                                {companyInfo.address && <div>{companyInfo.address}</div>}
                                                <div className="flex gap-3">
                                                    {companyInfo.phone && <span className="font-semibold">Tel: {companyInfo.phone}</span>}
                                                    {companyInfo.email && <span>Email: {companyInfo.email}</span>}
                                                </div>
                                                {companyInfo.doc && <div>CNPJ: {companyInfo.doc}</div>}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-right shrink-0 min-w-fit">
                                        <div className="border-2 border-slate-800 px-3 py-1.5 rounded-lg bg-slate-50">
                                            <div className="text-[8px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">Pedido de Venda N°</div>
                                            <div className="text-sm font-bold text-slate-900 tracking-tighter leading-none whitespace-nowrap">
                                                #{viewOrder.displayId || viewOrder.id.slice(0, 8).toUpperCase()}
                                            </div>
                                        </div>
                                        <div className="text-[10px] font-bold text-slate-400 mt-1.5 uppercase tracking-wide">
                                            Emissão: {viewOrder.createdAt ? new Date(viewOrder.createdAt).toLocaleDateString('pt-BR') : '-'}
                                        </div>
                                        <div className="text-[10px] font-bold text-slate-500 uppercase mt-0.5">
                                            Status: <span className="text-slate-900 font-bold px-1.5 py-0.5 rounded border border-slate-300 bg-white inline-block">{getStatusBadge(viewOrder.status).label}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Customer Information */}
                                <div className="border border-slate-300 rounded-xl overflow-hidden mb-2 break-inside-avoid shadow-sm">
                                    <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-300">
                                        <h3 className="font-bold text-[10px] uppercase tracking-widest text-slate-700">Dados do Cliente / Solicitante</h3>
                                    </div>
                                    <div className="p-2 grid grid-cols-2 gap-2 bg-white">
                                        <div>
                                            <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest">Identificação do Cliente</span>
                                            <span className="font-bold text-slate-900 text-xs uppercase">{viewOrder.customerName}</span>
                                        </div>
                                        <div>
                                            <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest">Local de Execução / Entrega</span>
                                            <span className="font-medium text-slate-700 text-xs uppercase">{viewOrder.customerAddress || freshCustomer?.address || 'Não Informado'}</span>
                                        </div>
                                        {(viewOrder.customerPhone || freshCustomer?.phone || viewOrder.customerEmail || freshCustomer?.email || viewOrder.customerDocument || freshCustomer?.document) && (
                                            <div className="col-span-2 pt-1 border-t border-slate-100 flex flex-wrap gap-x-4 gap-y-1">
                                                {(viewOrder.customerDocument || freshCustomer?.document || freshCustomer?.cpf || freshCustomer?.cnpj) && (
                                                    <div>
                                                        <span className="block text-[8px] font-bold text-slate-400 uppercase tracking-widest">CPF / CNPJ</span>
                                                        <span className="font-semibold text-slate-700 text-[10px]">{viewOrder.customerDocument || freshCustomer?.document || freshCustomer?.cpf || freshCustomer?.cnpj}</span>
                                                    </div>
                                                )}
                                                {(viewOrder.customerPhone || freshCustomer?.whatsapp || freshCustomer?.phone) && (
                                                    <div>
                                                        <span className="block text-[8px] font-bold text-slate-400 uppercase tracking-widest">Telefone</span>
                                                        <span className="font-medium text-slate-700 text-[10px]">{viewOrder.customerPhone || freshCustomer?.whatsapp || freshCustomer?.phone}</span>
                                                    </div>
                                                )}
                                                {(viewOrder.customerEmail || freshCustomer?.email) && (
                                                    <div>
                                                        <span className="block text-[8px] font-bold text-slate-400 uppercase tracking-widest">E-mail</span>
                                                        <span className="font-medium text-slate-700 text-[10px] lowercase">{viewOrder.customerEmail || freshCustomer?.email}</span>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Object/Description */}
                                {(viewOrder.title || viewOrder.description) && (
                                    <div className="border border-slate-300 rounded-xl overflow-hidden mb-2 break-inside-avoid">
                                        <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-300">
                                            <h3 className="font-bold text-[10px] uppercase tracking-widest text-slate-700">Objeto e Escopo Comercial</h3>
                                        </div>
                                        <div className="p-2 bg-white text-[10px] text-slate-800 font-medium whitespace-pre-wrap leading-relaxed">
                                            {viewOrder.title && <div className="font-bold uppercase mb-1">{viewOrder.title}</div>}
                                            {viewOrder.description && <div className="italic text-[10px]">{viewOrder.description}</div>}
                                        </div>
                                    </div>
                                )}

                                {/* Items Section */}
                                {viewOrder.items && viewOrder.items.length > 0 && (() => {
                                    const subtotalCalc = viewOrder.items.reduce((a: number, i: any) => a + (Number(i.total) || 0), 0);
                                    const disc = Number(viewOrder.discount) || 0;
                                    const discType = viewOrder.discountType || 'fixed';
                                    let dv = discType === 'percent' ? (subtotalCalc * disc / 100) : disc;
                                    const shippingVal = Number(viewOrder.shipping) || 0;
                                    const totalFinal = Number(viewOrder.totalValue) || (subtotalCalc + shippingVal - dv);

                                    return (
                                        <div className="mb-2">
                                            <div style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box', border: '1px solid #cbd5e1', borderRadius: '12px', overflow: 'hidden' }}>
                                                <table style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse' }}>
                                                    <colgroup>
                                                        <col style={{ width: '5%' }} />
                                                        <col style={{ width: '13%' }} />
                                                        <col style={{ width: '30%' }} />
                                                        <col style={{ width: '7%' }} />
                                                        <col style={{ width: '19%' }} />
                                                        <col style={{ width: '26%' }} />
                                                    </colgroup>
                                                    <thead>
                                                        <tr style={{ backgroundColor: '#1c2d4f', color: 'white', fontSize: '8px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', breakInside: 'avoid', pageBreakInside: 'avoid' }}>
                                                            <th style={{ padding: '4px 4px', textAlign: 'left', borderRight: '1px solid rgba(255,255,255,0.2)', borderRadius: '11px 0 0 0' }}>#</th>
                                                            <th style={{ padding: '4px 4px', textAlign: 'left', borderRight: '1px solid rgba(255,255,255,0.2)' }}>Código</th>
                                                            <th style={{ padding: '4px 4px', textAlign: 'left', borderRight: '1px solid rgba(255,255,255,0.2)' }}>Descrição</th>
                                                            <th style={{ padding: '4px 4px', textAlign: 'left', borderRight: '1px solid rgba(255,255,255,0.2)' }}>Qtd</th>
                                                            <th style={{ padding: '4px 4px', textAlign: 'left', borderRight: '1px solid rgba(255,255,255,0.2)' }}>V. Unit.</th>
                                                            <th style={{ padding: '4px 4px', textAlign: 'left', borderRadius: '0 11px 0 0' }}>Total</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {viewOrder.items.map((it: any, i: number) => (
                                                            <tr key={i} style={{ borderBottom: '1px solid #e2e8f0', backgroundColor: i % 2 === 0 ? '#fff' : '#f8fafc', breakInside: 'avoid', pageBreakInside: 'avoid' }}>
                                                                <td style={{ padding: '4px 4px', textAlign: 'left', fontWeight: 700, color: '#94a3b8', fontSize: '9px', borderRight: '1px solid #e2e8f0' }}>{String(i + 1).padStart(2, '0')}</td>
                                                                <td style={{ padding: '4px 4px', textAlign: 'left', fontSize: '9px', fontWeight: 700, color: '#3e5b99', fontFamily: "'Poppins', sans-serif", letterSpacing: '0.05em', borderRight: '1px solid #e2e8f0', wordBreak: 'break-all' }}>
                                                                    {it.stockCode || <span style={{ color: '#cbd5e1', fontStyle: 'italic', fontWeight: 400 }}>—</span>}
                                                                </td>
                                                                <td style={{ padding: '4px 4px', fontSize: '9px', fontWeight: 700, color: '#1e293b', textTransform: 'uppercase', borderRight: '1px solid #e2e8f0', wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                                                                    {it.description}
                                                                </td>
                                                                <td style={{ padding: '4px 4px', textAlign: 'left', fontWeight: 700, fontSize: '9px', color: '#475569', borderRight: '1px solid #e2e8f0' }}>
                                                                    {it.quantity}
                                                                </td>
                                                                <td style={{ padding: '4px 4px', textAlign: 'left', fontSize: '9px', color: '#475569', borderRight: '1px solid #e2e8f0', wordBreak: 'break-all' }}>
                                                                    R$ {Number(it.unitPrice || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                                </td>
                                                                <td style={{ padding: '4px 4px', textAlign: 'left', fontWeight: 700, fontSize: '9px', color: '#1c2d4f', wordBreak: 'break-all' }}>
                                                                    R$ {Number(it.total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>

                                                {/* Condições de Pagamento */}
                                                {(viewOrder.paymentMethod || viewOrder.paymentNotes) && (
                                                    <div style={{ padding: '6px 12px', borderTop: '1px solid rgba(0,0,0,0.1)', backgroundColor: '#f8fafc', breakInside: 'avoid', pageBreakInside: 'avoid' }}>
                                                        <div style={{ fontSize: '9px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: '2px' }}>Condições de Pagamento</div>
                                                        {viewOrder.paymentMethod && (
                                                            <div style={{ fontSize: '10px', fontWeight: 700, color: '#1e293b', textTransform: 'uppercase', marginBottom: '0' }}>
                                                                Forma: {viewOrder.paymentMethod} {viewOrder.installments && viewOrder.installments > 1 ? `(${viewOrder.installments}x)` : ''}
                                                            </div>
                                                        )}
                                                        {viewOrder.paymentNotes && (
                                                            <div style={{ fontSize: '9px', fontWeight: 400, color: '#475569', whiteSpace: 'pre-wrap', marginTop: '2px' }}>
                                                                {viewOrder.paymentNotes}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}

                                                {/* Total Footer */}
                                                <div className="flex flex-col md:flex-row print:flex-row bg-[#1c2d4f] text-white" style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}>
                                                    <div className="flex-1 p-2 print:p-2 border-b md:border-b-0 print:border-b-0 md:border-r print:border-r border-white/20 flex flex-col justify-center">
                                                        <span className="text-[8px] font-bold text-white/70 uppercase mb-0.5">Notas sobre Condições Comerciais:</span>
                                                        <span className="text-[8px] font-medium text-white/90 uppercase tracking-tight italic">
                                                            Valores expressos em Reais (BRL). Pedido formalizado para faturamento e controle de estoque.
                                                        </span>
                                                    </div>
                                                    <div className="w-full md:w-auto print:w-auto min-w-[200px] md:min-w-[250px] print:min-w-[250px] p-2 print:p-2 flex flex-col justify-center items-end bg-[#132039]">
                                                        <div className="w-full text-right space-y-0.5">
                                                            <div className="flex justify-between items-center text-[8px] uppercase tracking-widest text-[#a8b8d8]/80">
                                                                <span>Subtotal:</span>
                                                                <span className="text-[9px] font-bold text-white">
                                                                    R$ {subtotalCalc.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                                </span>
                                                            </div>
                                                            {shippingVal > 0 && (
                                                                <div className="flex justify-between items-center text-[8px] uppercase tracking-widest text-[#a8b8d8]/80">
                                                                    <span>Frete:</span>
                                                                    <span className="text-[9px] font-bold text-white">
                                                                        + R$ {shippingVal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                                    </span>
                                                                </div>
                                                            )}
                                                            {dv > 0 && (
                                                                <div className="flex justify-between items-center text-[8px] uppercase tracking-widest text-rose-300">
                                                                    <span>Desconto {discType === 'percent' ? `(${disc}%)` : ''}:</span>
                                                                    <span className="text-[9px] font-bold text-rose-300">
                                                                        - R$ {dv.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                                    </span>
                                                                </div>
                                                            )}
                                                            <div className="w-full border-t border-white/20 mt-1 pt-1 flex justify-between items-baseline">
                                                                <span className="text-[8px] uppercase font-bold tracking-widest text-[#a8b8d8]">Total do Pedido:</span>
                                                                <span className="text-[12px] font-black tracking-tight text-white ml-3">
                                                                    R$ {totalFinal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })()}

                                {/* Observações / Informações Adicionais */}
                                {viewOrder.notes && (
                                    <div className="border border-slate-300 rounded-xl overflow-hidden mb-2 break-inside-avoid">
                                        <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-300">
                                            <h3 className="font-bold text-[10px] uppercase tracking-widest text-slate-700">Observações Gerais</h3>
                                        </div>
                                        <div className="p-2 bg-white text-[10px] text-slate-800 font-medium whitespace-pre-wrap leading-relaxed">
                                            {viewOrder.notes}
                                        </div>
                                    </div>
                                )}

                                {/* Protocolo de Finalização (quando Concluído/Faturado) */}
                                {(String(viewOrder.status || '').toUpperCase() === 'CONCLUIDO' || String(viewOrder.status || '').toUpperCase() === 'FATURADO') && (
                                    <div className="border border-emerald-400 rounded-lg overflow-hidden break-inside-avoid mb-4 bg-emerald-50/20">
                                        <div className="bg-emerald-50 px-3 py-1.5 border-b border-emerald-200 flex items-center gap-1.5">
                                            <CheckCircle size={13} className="text-emerald-600" />
                                            <span className="font-bold text-[9px] uppercase tracking-widest text-emerald-800">
                                                Protocolo de Pedido Finalizado e Encaminhado ao Financeiro
                                            </span>
                                        </div>
                                        <div className="p-2.5 grid grid-cols-2 gap-3 bg-white text-[9px]">
                                            <div className="flex flex-col justify-center gap-0.5">
                                                <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Emissor / Vendedor</span>
                                                <span className="text-[10px] font-bold text-slate-900 uppercase">{viewOrder.createdByName || 'Usuário do Sistema'}</span>
                                                <span className="text-[8px] text-slate-500">Status: {getStatusBadge(viewOrder.status).label} • Baixa de estoque efetivada</span>
                                            </div>
                                            <div className="border border-slate-200 rounded-lg h-14 flex flex-col items-center justify-center bg-slate-50/50 p-2 text-center">
                                                <ShieldCheck size={18} className="text-emerald-600 mb-0.5" />
                                                <span className="text-[8px] font-bold text-slate-700 uppercase">Validação do Sistema DUNO</span>
                                                <span className="text-[7px] text-slate-400 font-mono">AUTENTICAÇÃO INTERNA DE PEDIDO</span>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Área de Assinatura com espaçamento adequado */}
                                <div className="mt-8 pt-6 border-t-2 border-dashed border-slate-300 grid grid-cols-2 gap-8 break-inside-avoid">
                                    <div className="flex flex-col items-center justify-end">
                                        <div className="w-full h-16 sm:h-20 flex items-end">
                                            <div className="w-full border-b border-slate-800"></div>
                                        </div>
                                        <span className="text-[9px] font-bold text-slate-800 uppercase text-center truncate w-full mt-2">{companyInfo.name}</span>
                                        <span className="text-[8px] font-bold text-slate-500 uppercase mt-0.5">Autorizante / Comercial</span>
                                    </div>
                                    <div className="flex flex-col items-center justify-end">
                                        <div className="w-full h-16 sm:h-20 flex items-end">
                                            <div className="w-full border-b border-slate-800"></div>
                                        </div>
                                        <span className="text-[9px] font-bold text-slate-800 uppercase text-center truncate w-full mt-2">{viewOrder.customerName}</span>
                                        <span className="text-[8px] font-bold text-slate-500 uppercase mt-0.5">De Acordo / Carimbo e Assinatura</span>
                                    </div>
                                </div>

                                {/* Print Footer */}
                                <div className="print:fixed print:bottom-0 print:left-0 print:w-full print:px-6 print:pb-1 print:pt-2 print:bg-white mt-6 pt-3 border-t-2 border-[#1c2d4f] flex justify-between items-start opacity-70">
                                    <div className="flex flex-col gap-0.5">
                                        <NexusBranding size="lg" className="scale-75 origin-left -translate-y-2" />
                                        <p className="text-[9px] font-bold text-slate-500 uppercase leading-none">Uma solução Duno.</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[9px] font-bold uppercase tracking-widest text-[#1c2d4f] mb-0.5">Documento digital Duno</p>
                                        <p className="text-[8px] uppercase tracking-tight font-medium text-slate-500 max-w-[250px] ml-auto leading-tight italic">
                                            O pedido formalizado e seu aceite constituem prova de concordância comercial.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            , document.body)}
        </div>
    );
};
