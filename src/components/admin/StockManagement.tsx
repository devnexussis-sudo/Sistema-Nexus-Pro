
import { AlertTriangle, Barcode, Box, DollarSign, Edit3, Filter, History, Info, Layers, LayoutDashboard, List, Loader2, Package, Plus, RefreshCw, Save, Scale, Search, Tag, Trash2, TrendingDown, TrendingUp, Users, Wand2, X } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { DataService } from '../../services/dataService';
import { TenantService } from '../../services/tenantService';
import { Category, StockItem } from '../../types';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Pagination } from '../ui/Pagination';

export const StockManagement: React.FC = () => {
    const { isAuthLoading, session } = useAuth();

    // Application State
    const [activeTab, setActiveTab] = useState<'items' | 'categories' | 'techs' | 'movements'>('items');

    // --- Items State ---
    const [items, setItems] = useState<StockItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [showFilters, setShowFilters] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<StockItem | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Filters
    const [categoryFilter, setCategoryFilter] = useState('ALL');
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [availableCategories, setAvailableCategories] = useState<Category[]>([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalItemsCount, setTotalItemsCount] = useState(0);
    const abortControllerRef = useRef<AbortController | null>(null);
    const isFetching = useRef<boolean>(false);
    const ITEMS_PER_PAGE = 20;

    // --- Categories State ---
    const [categories, setCategories] = useState<Category[]>([]);
    const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
    const [editingCategory, setEditingCategory] = useState<Category | null>(null);
    const [categoryFormData, setCategoryFormData] = useState({ name: '', active: true });

    // Item Form Data
    const [formData, setFormData] = useState<any>({
        code: '',
        externalCode: '',
        description: '',
        category: '',
        location: '',
        quantity: '',
        minQuantity: '',
        costPrice: '',
        sellPrice: '',
        freightCost: '',
        taxPercent: '', // Changed from taxCost to taxPercent
        unit: 'UN',
        active: true
    });

    // --- Restock State ---
    const [isRestockModalOpen, setIsRestockModalOpen] = useState(false);
    const [restockSearch, setRestockSearch] = useState('');
    const [selectedRestockItem, setSelectedRestockItem] = useState<StockItem | null>(null);
    const [restockQuantity, setRestockQuantity] = useState('');

    // --- Technical Stock State ---
    const [techs, setTechs] = useState<any[]>([]);
    const [selectedTech, setSelectedTech] = useState<any | null>(null);
    const [techStock, setTechStock] = useState<any[]>([]);
    const [movements, setMovements] = useState<any[]>([]);
    const [movSearch, setMovSearch] = useState('');
    const [movTypeFilter, setMovTypeFilter] = useState('ALL');
    const getDefaultDates = () => {
        const dEnd = new Date();
        const dStart = new Date();
        dStart.setMonth(dStart.getMonth() - 2);
        return { start: dStart.toISOString().split('T')[0], end: dEnd.toISOString().split('T')[0] };
    };
    const { start: initStart, end: initEnd } = getDefaultDates();
    const [movDateFrom, setMovDateFrom] = useState(initStart);
    const [movDateTo, setMovDateTo] = useState(initEnd);

    const handleDateValidation = (start: string, end: string) => {
        if (start && end) {
            const d1 = new Date(start);
            const d2 = new Date(end);
            if ((d2.getTime() - d1.getTime()) > 31622400000) { // 366 dias
                alert('Atenção: O período selecionado não pode ser maior que 1 ano. A data limite foi ajustada.');
                setMovDateFrom(start);
                setMovDateTo(new Date(d1.getTime() + 31536000000).toISOString().split('T')[0]);
                return;
            }
        }
        setMovDateFrom(start);
        setMovDateTo(end);
    };
    const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
    const [transferData, setTransferData] = useState({ itemId: '', techId: '', quantity: '', direction: 'transfer' });
    const [techSearch, setTechSearch] = useState('');
    const [modalTab, setModalTab] = useState<'dados' | 'financial' | 'logs'>('dados');

    // --- Loaders ---
    const loadItems = async (page: number, search: string, category: string, status: string) => {
        if (isFetching.current) return;

        if (abortControllerRef.current) {
            abortControllerRef.current.abort('New pagination fetch');
        }

        const controller = new AbortController();
        abortControllerRef.current = controller;
        const signal = controller.signal;

        isFetching.current = true;
        setLoading(true);
        setError(null);

        const timeoutId = setTimeout(() => {
            if (abortControllerRef.current === controller && loading) {
                console.warn('[Stock] ⚠️ Load timeout - check Supabase logs');
                setError('A conexão está demorando mais que o esperado. Verifique sua internet.');
                setLoading(false);
            }
        }, 15000);

        try {
            if (isAuthLoading || !session) {
                console.warn('[Stock] 🔒 Fetch bloqueado: Auth ainda carregando ou sem sessão.');
                isFetching.current = false;
                setLoading(false);
                return;
            }

            const { ensureValidSession } = await import('../../lib/supabase');
            const sessionOk = await ensureValidSession();

            if (!sessionOk) {
                console.warn('[Stock] 🔒 Sessão ausente (Bolso global). Aguardando liberação...');
                setTimeout(() => loadItems(page, search, category, status), 500);
                setLoading(false);
                return;
            }

            const { data, count, error } = await DataService.getStockItemsPaginated(
                page,
                ITEMS_PER_PAGE,
                { searchTerm: search, categoryFilter: category, statusFilter: status },
                signal
            );

            if (signal.aborted) return;

            setItems(data || []);
            setTotalItemsCount(count || 0);
            setError(null);
        } catch (err: any) {
            if (signal.aborted) return;

            // "Killed by Nexus Recovery" = Recovery Engine abortou o fetch no Wake Up.
            // É normal e esperado. Silenciosamente ignoramos — o useEffect vai re-disparar
            // o fetch automaticamente quando a sessão/estado estiver estável.
            const isNexusKill = err?.message?.includes('Killed by Nexus') || err?.message?.includes('Nexus Recovery');
            const isAbort = err?.name === 'AbortError' || err?.message?.includes('AbortError') || err?.message?.includes('Aborted');

            if (isNexusKill || isAbort) {
                console.log('[Stock] 🛑 Fetch interrompido pelo Recovery (normal). Aguardando re-trigger automático.');
                return; // sem retry manual, sem erro no console
            }

            console.error('Erro ao carregar estoque:', err);
            setError(err.message || 'Erro inesperado ao sincronizar estoque.');
        } finally {
            clearTimeout(timeoutId);
            isFetching.current = false;
            if (!signal.aborted) {
                setLoading(false);
            }
        }
    };

    const loadCategories = async () => {
        try {
            const data = await DataService.getCategories();
            setCategories(data);
            setAvailableCategories(data);
        } catch (err: any) {
            const isNexusKill = err?.message?.includes('Killed by Nexus') || err?.name === 'AbortError';
            if (!isNexusKill) console.error('Erro ao carregar categorias:', err);
        }
    };

    const loadTechs = async () => {
        try {
            const tenantId = DataService.getCurrentTenantId();
            if (!tenantId) return;
            const data = await TenantService.getTenantUsers(tenantId);
            setTechs(data.filter((u: any) => u.role === 'TECHNICIAN' || u.role === 'ADMIN'));
        } catch (err: any) {
            const isNexusKill = err?.message?.includes('Killed by Nexus') || err?.name === 'AbortError';
            if (!isNexusKill) console.error('Erro ao carregar técnicos:', err);
        }
    };

    const loadMovements = async () => {
        try {
            const data = await DataService.getMovements();
            setMovements(data);
        } catch (err: any) {
            console.error('Erro ao carregar movimentações:', err);
            if (err.name === 'AbortError' || err.message?.includes('Abort') || err.message?.includes('Killed by Nexus')) {
                setTimeout(loadMovements, 3000);
            }
        }
    };

    const loadAll = async () => {
        loadItems(currentPage, searchTerm, categoryFilter, statusFilter);
        loadCategories();
        loadTechs();
        loadMovements();
    };

    useEffect(() => {
        const init = async () => {
            // Tenta obter usuário do service
            let user = await DataService.getCurrentUser();

            // Se falhar o service (cache), tenta direto no Supabase para forçar refresh
            if (!user?.tenantId) {
                const { data: { session } } = await (await import('../../lib/supabase')).supabase.auth.getSession();
                if (session?.user?.user_metadata?.tenantId) {
                    console.log('🛡️ [StockManagement] Tenant ID recuperado via Supabase Session');
                    loadAll();
                    return;
                }
            }

            if (user?.tenantId) {
                loadAll();
            } else {
                console.warn("🛡️ [StockManagement] Tenant ID não detectado. Tentando carregamento forçado...");
                setLoading(false);
                setError('Não foi possível identificar seu Tenant ID. Recarregue a página ou faça login novamente.');
            }
        }
        init();
    }, []);

    // --- Item Handlers ---
    const handleOpenModal = (item?: StockItem) => {
        setModalTab('dados');
        if (item) {
            setEditingItem(item);
            // Reverse calculate tax percent for editing (Policy: Base on Cost Price)
            const cost = item.costPrice || 0;
            const tax = item.taxCost || 0;
            const percent = cost > 0 ? (tax / cost) * 100 : 0;

            setFormData({
                ...item,
                taxPercent: percent > 0 ? percent.toFixed(2) : ''
            });
        } else {
            setEditingItem(null);
            setFormData({
                code: '',
                externalCode: '',
                description: '',
                category: '',
                location: '',
                quantity: '',
                minQuantity: '',
                costPrice: '',
                sellPrice: '',
                freightCost: '',
                taxPercent: '',
                unit: 'UN',
                active: true
            });
        }
        setIsModalOpen(true);
    };

    const generateCode = () => {
        const random = Math.floor(Math.random() * 100000).toString().padStart(5, '0');
        setFormData((prev: any) => ({ ...prev, code: `STK-${random}` }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const payload: StockItem = {
                ...formData,
                quantity: Number(formData.quantity) || 0,
                minQuantity: Number(formData.minQuantity) || 0,
                costPrice: Number(formData.costPrice) || 0,
                sellPrice: Number(formData.sellPrice) || 0,
                freightCost: Number(formData.freightCost) || 0,
                // Calculate actual tax cost for saving to DB (or keep percentage if DB supports it.
                // Based on StockItem type, it expects taxCost (number).
                // So we should calculate the absolute value here for persistence?
                // OR we should store the percentage?
                // StockItem has taxCost?: number.
                // If I change the UI to use %, I should probably calculate the cost before save,
                // OR ideally add taxPercent to the schema.
                // Given constraints, I will calculate the cost value on save,
                // BUT for UI state I need to persist the percentage to restore it properly on edit?
                // If I save only taxCost, when I edit, I have to reverse calculate %: (Tax / Cost) * 100.
                // That works.
                // Tax burden calculated on the COST PRICE (Purchase Price) as requested
                taxCost: (Number(formData.costPrice) || 0) * ((Number(formData.taxPercent) || 0) / 100)
            } as StockItem;

            if (editingItem) {
                await DataService.updateStockItem({ ...editingItem, ...payload });
            } else {
                await DataService.createStockItem(payload);
            }
            setIsModalOpen(false);
            loadItems(currentPage, searchTerm, categoryFilter, statusFilter);
        } catch (error: any) {
            console.error('Erro completo ao salvar item:', error);
            alert(`Erro ao salvar item no banco de dados:\n\n${error.message || 'Verifique sua conexão ou tente novamente.'}`);
        }
    };

    const handleDelete = async (id: string) => {
        if (confirm('Tem certeza que deseja remover este item?')) {
            await DataService.deleteStockItem(id);
            loadItems(currentPage, searchTerm, categoryFilter, statusFilter);
        }
    };

    // --- Category Handlers ---
    const handleOpenCategoryModal = (cat?: Category) => {
        if (cat) {
            setEditingCategory(cat);
            setCategoryFormData({ name: cat.name, active: cat.active });
        } else {
            setEditingCategory(null);
            setCategoryFormData({ name: '', active: true });
        }
        setIsCategoryModalOpen(true);
    };

    const handleCategorySubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (editingCategory) {
                await DataService.updateCategory({
                    ...editingCategory,
                    ...categoryFormData
                });
            } else {
                await DataService.createCategory({
                    ...categoryFormData,
                    type: 'stock'
                } as any);
            }
            setIsCategoryModalOpen(false);
            loadCategories();
            loadItems(currentPage, searchTerm, categoryFilter, statusFilter);
            loadItems(currentPage, searchTerm, categoryFilter, statusFilter);
        } catch (error: any) {
            console.error('❌ Erro completo ao salvar categoria:', error);
            alert(`Erro ao salvar categoria: ${error.message || 'Verifique o console para mais detalhes.'}`);
        }
    };

    const handleDeleteCategory = async (id: string) => {
        if (confirm('Tem certeza? Isso não removerá os itens associados.')) {
            await DataService.deleteCategory(id);
            loadCategories();
            loadItems(currentPage, searchTerm, categoryFilter, statusFilter);
        }
    };



    // --- Restock Handlers ---
    const handleRestockSearch = (term: string) => {
        setRestockSearch(term);
        // Find exact match first, or partial
        if (!term) {
            setSelectedRestockItem(null);
            return;
        }

        const match = items.find(i =>
            i.code.toLowerCase() === term.toLowerCase() ||
            (i.externalCode && i.externalCode.toLowerCase() === term.toLowerCase())
        );

        if (match) setSelectedRestockItem(match);
        else setSelectedRestockItem(null);
    };

    const handleRestockSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedRestockItem || !restockQuantity) return;

        const qtyToAdd = Number(restockQuantity);
        if (qtyToAdd <= 0) return;

        try {
            const updatedItem = {
                ...selectedRestockItem,
                quantity: selectedRestockItem.quantity + qtyToAdd,
                lastRestockDate: new Date().toISOString()
            };

            await DataService.updateStockItem(updatedItem);

            // Log de Movimentação (Audit Trail)
            const user = await DataService.getCurrentUser();
            const tenantId = DataService.getCurrentTenantId();
            if (tenantId) {
                await DataService.getServiceClient().from('stock_movements').insert([{
                    tenant_id: tenantId,
                    stock_item_id: selectedRestockItem.id,
                    type: 'RESTOCK',
                    quantity: qtyToAdd,
                    source: 'FORNECEDOR',
                    destination: 'GENERAL',
                    created_by: user?.id
                }]);
            }

            // Reset
            setRestockQuantity('');
            setRestockSearch('');
            setSelectedRestockItem(null);
            alert(`Estoque atualizado! Nova quantidade: ${updatedItem.quantity}`);
            loadItems(currentPage, searchTerm, categoryFilter, statusFilter);
            loadMovements();
        } catch (error) {
            alert('Erro ao atualizar estoque.');
        }
    };
    // Use Effect for filtering debounce and pagination
    useEffect(() => {
        if (activeTab !== 'items') return;

        const timer = setTimeout(() => {
            loadItems(currentPage, searchTerm, categoryFilter, statusFilter);
        }, 200);

        return () => {
            clearTimeout(timer);
            isFetching.current = false;
            if (abortControllerRef.current) {
                abortControllerRef.current.abort('Component Unmount / Effect Cleanup');
            }
        };
    }, [currentPage, searchTerm, categoryFilter, statusFilter, activeTab, isAuthLoading, session]);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, categoryFilter, statusFilter, activeTab]);

    const totalPages = Math.ceil(totalItemsCount / ITEMS_PER_PAGE);

    // 🔒 Auth Guard Render
    if (isAuthLoading) {
        return (
            <div className="flex items-center justify-center p-8 h-full">
                <Loader2 className="animate-spin text-primary-500 w-8 h-8" />
                <span className="ml-3 text-slate-500 font-medium">Validando sessão segura...</span>
            </div>
        );
    }

    if (!session) {
        return (
            <div className="flex flex-col items-center justify-center p-8 h-full">
                <AlertTriangle className="text-rose-500 w-12 h-12 mb-4" />
                <h3 className="text-lg font-bold text-slate-800">Sessão Expirada</h3>
                <p className="text-sm text-slate-500 mb-6">Sua sessão caiu ou você não tem acesso a esta página.</p>
                <Button variant="primary" onClick={() => window.location.reload()}>Fazer Login</Button>
            </div>
        );
    }

    const calculateTotalCost = (item: any) => {
        const cost = Number(item.costPrice) || 0;
        const freight = Number(item.freightCost) || 0;
        
        // Prioritizamos o cálculo dinâmico via porcentagem se ela existir (modo edição/formulário)
        // para que o preview reaja instantaneamente sobre o PREÇO DE COMPRA.
        const taxVal = (item.taxPercent !== undefined && item.taxPercent !== '')
            ? (cost * (Number(item.taxPercent) / 100))
            : (Number(item.taxCost) || 0);

        return cost + freight + taxVal;
    };

    const calculateMargin = (item: any) => {
        const totalCost = calculateTotalCost(item);
        const sell = Number(item.sellPrice) || 0;
        if (totalCost === 0) return 0;
        return ((sell - totalCost) / totalCost) * 100;
    };

    return (
        <div className="p-4 pr-8 animate-fade-in font-poppins">
            <div className="mb-6 flex flex-col lg:flex-row gap-6 items-start lg:items-center justify-between pr-2">
                {/* Tabs */}
                <div className="flex bg-[#f8fafc] p-1.5 rounded-2xl border border-slate-200 shadow-xl shadow-slate-200/40 shrink-0 overflow-x-auto max-w-full">
                    <button onClick={() => setActiveTab('items')} className={`flex items-center gap-2 px-6 py-3 rounded-xl text-[10px] font-black uppercase transition-all whitespace-nowrap ${activeTab === 'items' ? 'bg-[#1c2d4f] text-white shadow-lg shadow-primary-900/20' : 'text-slate-500 hover:text-[#1c2d4f] hover:bg-white'}`}>
                        <List size={14} /> Itens em Estoque
                    </button>
                    <button onClick={() => setActiveTab('categories')} className={`flex items-center gap-2 px-6 py-3 rounded-xl text-[10px] font-black uppercase transition-all whitespace-nowrap ${activeTab === 'categories' ? 'bg-[#10b981] text-white shadow-lg shadow-emerald-900/20' : 'text-slate-500 hover:text-emerald-600 hover:bg-white'}`}>
                        <Tag size={14} /> Categorias
                    </button>
                    <button onClick={() => setActiveTab('techs')} className={`flex items-center gap-2 px-6 py-3 rounded-xl text-[10px] font-black uppercase transition-all whitespace-nowrap ${activeTab === 'techs' ? 'bg-[#f59e0b] text-white shadow-lg shadow-amber-900/20' : 'text-slate-500 hover:text-amber-600 hover:bg-white'}`}>
                        <Box size={14} /> Estoque Técnico
                    </button>
                    <button onClick={() => setActiveTab('movements')} className={`flex items-center gap-2 px-6 py-3 rounded-xl text-[10px] font-black uppercase transition-all whitespace-nowrap ${activeTab === 'movements' ? 'bg-slate-800 text-white shadow-lg shadow-slate-900/20' : 'text-slate-500 hover:text-slate-800 hover:bg-white'}`}>
                        <Scale size={14} /> Auditoria / Logs
                    </button>
                </div>

                <div className="flex items-center gap-4 w-full lg:w-auto">
                    <div className="flex items-center gap-3 bg-white p-1.5 rounded-2xl border border-slate-200 shadow-md flex-1 lg:flex-none">
                        {activeTab === 'items' && (
                            <div className="flex items-center gap-3 pl-3 pr-2 border-r border-slate-100 hidden sm:flex">
                                <Search size={14} className="text-slate-400" />
                                <input
                                    type="text"
                                    placeholder="Localizar no estoque..."
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                    className="bg-transparent text-[10px] font-bold uppercase text-slate-700 outline-none w-32 placeholder:text-slate-300"
                                />
                            </div>
                        )}

                        {activeTab === 'items' && (
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors hidden md:flex">
                                <Filter size={12} className="text-slate-400" />
                                <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className="bg-transparent text-[9px] font-black uppercase text-slate-600 outline-none cursor-pointer">
                                    <option value="ALL">Categoria</option>
                                    {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                                </select>
                            </div>
                        )}

                        <div className="flex items-center gap-2 shrink-0">
                            <Button
                                onClick={() => setIsRestockModalOpen(true)}
                                variant="secondary"
                                size="sm"
                                className="h-[38px] px-5 text-[10px] font-black uppercase gap-2"
                            >
                                <Scale size={14} /> Entrada
                            </Button>

                            {(activeTab === 'items' || activeTab === 'categories') && (
                                <Button
                                    onClick={() => activeTab === 'items' ? handleOpenModal() : handleOpenCategoryModal()}
                                    variant="primary"
                                    className={`h-[38px] px-5 text-[10px] font-black uppercase gap-2 whitespace-nowrap ${activeTab === 'items' ? 'bg-[#10b981] hover:bg-[#059669] border-[#10b981]' : ''}`}
                                >
                                    <Plus size={14} /> {activeTab === 'items' ? 'Novo Cadastro' : 'Nova Categoria'}
                                </Button>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Table Container */}
            <div className="bg-white border border-slate-300/80 rounded-xl shadow-lg shadow-slate-200/50 flex flex-col overflow-hidden flex-1 ring-1 ring-slate-200/80">
                {activeTab === 'items' ? (
                    <>
                        <div className="flex-1 overflow-auto custom-scrollbar">
                            <table className="w-full border-collapse">
                                <thead className="sticky top-0 bg-slate-200/60 backdrop-blur-md border-b border-slate-300 z-10 shadow-sm">
                                    <tr className="text-[12px] font-semibold text-slate-600 tracking-tight text-left">
                                        <th className="px-3 py-2 first:pl-6">Identificação / SKU</th>
                                        <th className="px-3 py-2">Descrição do Produto</th>
                                        <th className="px-3 py-2">Localização</th>
                                        <th className="px-3 py-2 text-center">Saldo</th>
                                        <th className="px-3 py-2 text-right whitespace-nowrap">Avaliação Custo</th>
                                        <th className="px-3 py-2 text-right whitespace-nowrap">Venda Público</th>
                                        <th className="px-3 py-2 text-center">Rentabilidade</th>
                                        <th className="px-3 py-2 text-right pr-6">Gestão</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {error ? (
                                        <tr>
                                            <td colSpan={8} className="py-20 text-center px-6">
                                                <div className="max-w-md mx-auto">
                                                    <AlertTriangle size={40} className="mx-auto text-rose-500 mb-4 animate-pulse" />
                                                    <p className="text-[10px] font-black text-rose-600 uppercase tracking-[0.2em] mb-2">Falha na Sincronização</p>
                                                    <p className="text-xs font-bold text-slate-500 mb-6">{error}</p>
                                                    <button
                                                        onClick={() => loadAll()}
                                                        className="px-8 py-3 bg-[#1c2d4f] text-white text-[10px] font-black uppercase rounded-[2rem] hover:bg-[#253a66] transition-all shadow-xl shadow-primary-900/20 active:scale-95 flex items-center gap-2 mx-auto"
                                                    >
                                                        <RefreshCw size={14} /> Tentar Reconectar
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ) : loading ? (
                                        <tr>
                                            <td colSpan={8} className="py-20 text-center">
                                                <RefreshCw size={40} className="mx-auto text-primary-600 animate-spin mb-4" />
                                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sincronizando Estoque...</p>
                                            </td>
                                        </tr>
                                    ) :
                                        items.length === 0 ? (
                                            <tr>
                                                <td colSpan={8} className="py-20 text-center">
                                                    <div className="w-16 h-16 bg-slate-50 rounded-[2rem] flex items-center justify-center mx-auto mb-4 border border-slate-100">
                                                        <Package size={24} className="text-slate-300" />
                                                    </div>
                                                    <p className="text-[10px] font-black tracking-widest uppercase text-slate-400">Nenhum item localizado</p>
                                                </td>
                                            </tr>
                                        ) :
                                            items.map(item => {
                                                const totalCost = calculateTotalCost(item);
                                                const margin = calculateMargin(item);
                                                return (
                                                    <tr
                                                        key={item.id}
                                                        className="transition-all border-b border-slate-100 hover:border-slate-200 group cursor-pointer bg-white hover:bg-slate-50"
                                                        onClick={() => handleOpenModal(item)}
                                                    >
                                                        <td className="px-3 py-3 pl-6">
                                                            <div className="flex flex-col truncate max-w-[100px]">
                                                                <span className="text-[12px] font-medium text-primary-600 truncate">{item?.code || '---'}</span>
                                                                {item?.externalCode && (
                                                                    <span className="text-[10px] text-slate-400 flex items-center gap-1 truncate font-normal">
                                                                        <Barcode size={10} className="shrink-0" /> {item.externalCode}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className="px-3 py-3">
                                                            <p className="text-[12px] font-medium text-slate-700 truncate max-w-[220px]">{item?.description || 'Item sem descrição'}</p>
                                                            <div className="flex gap-1.5 overflow-hidden">
                                                                <span className="text-[10px] text-slate-400 truncate">{item?.category || '-'}</span>
                                                                <span className="text-[10px] text-slate-300 shrink-0">•</span>
                                                                <span className="text-[10px] text-slate-400 shrink-0">{item?.unit || 'UN'}</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-3 py-3 text-[11px] text-slate-500 truncate max-w-[100px]">{item?.location || '-'}</td>
                                                        <td className="px-3 py-3 text-center">
                                                            <div className="flex items-center justify-center gap-1.5">
                                                                <span className={`text-[12px] font-semibold tracking-tight ${(item?.quantity || 0) <= (item?.minQuantity || 0) ? 'text-rose-500' : 'text-slate-700'}`}>{item?.quantity || 0}</span>
                                                                {(item?.quantity || 0) <= (item?.minQuantity || 0) && <AlertTriangle size={12} className="text-rose-500 shrink-0" />}
                                                            </div>
                                                        </td>
                                                        <td className="px-3 py-3 text-[11px] text-slate-500 text-right whitespace-nowrap">R$ {totalCost.toFixed(2)}</td>
                                                        <td className="px-3 py-3 text-[11px] text-slate-700 text-right whitespace-nowrap font-medium">R$ {(item?.sellPrice || 0).toFixed(2)}</td>
                                                        <td className="px-3 py-3">
                                                            <div className={`flex items-center justify-center gap-1 text-[11px] font-bold ${margin >= 30 ? 'text-emerald-500' : (margin > 0 ? 'text-amber-500' : 'text-rose-500')}`}>
                                                                {margin >= 0 ? <TrendingUp size={12} className="shrink-0" /> : <TrendingDown size={12} className="shrink-0" />}
                                                                {margin.toFixed(1)}%
                                                            </div>
                                                        </td>
                                                        <td className="px-3 py-3 text-right pr-6">
                                                            <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                                                <Button 
                                                                    onClick={(e) => { e.stopPropagation(); handleOpenModal(item); }} 
                                                                    variant="secondary"
                                                                    size="sm"
                                                                    className="p-2 text-primary-600 bg-primary-50 hover:bg-primary-600 hover:text-white rounded-lg border border-primary-200 transition-all" 
                                                                    title="Ver Detalhes"
                                                                >
                                                                    <Package size={14} />
                                                                </Button>
                                                                <Button 
                                                                    onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }} 
                                                                    variant="danger"
                                                                    size="sm"
                                                                    className="p-2 text-rose-400 bg-rose-50 hover:bg-rose-600 hover:text-white rounded-lg border border-transparent hover:border-rose-200 transition-all" 
                                                                    title="Excluir"
                                                                >
                                                                    <Trash2 size={14} />
                                                                </Button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                </tbody>
                            </table>
                        </div>
                        <Pagination
                            currentPage={currentPage}
                            totalPages={totalPages}
                            totalItems={totalItemsCount}
                            itemsPerPage={ITEMS_PER_PAGE}
                            onPageChange={setCurrentPage}
                        />
                    </>
                ) : (
                    <div className="p-10 flex-1 overflow-auto custom-scrollbar">
                        {activeTab === 'categories' && (
                            <>
                                <h3 className="text-xl font-black text-slate-800 uppercase  mb-6 flex items-center gap-3">
                                    <Tag className="text-emerald-500" /> Gerenciar Categorias
                                </h3>
                                {categories.length === 0 ? (
                                    <div className="text-center py-20 bg-slate-50 rounded-3xl border border-dashed border-slate-200">
                                        <Tag size={40} className="mx-auto text-slate-300 mb-4" />
                                        <p className="text-slate-400 font-bold uppercase text-xs">Nenhuma categoria encontrada.</p>
                                        <button onClick={() => handleOpenCategoryModal()} className="mt-4 text-emerald-600 font-black text-[10px] uppercase hover:underline">
                                            Criar Primeira Categoria
                                        </button>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {categories.map(cat => (
                                            <div key={cat.id} className="p-6 bg-white border border-slate-200 rounded-3xl shadow-sm hover:shadow-md transition-all flex items-center justify-between group">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600">
                                                        <Layers size={18} />
                                                    </div>
                                                    <div>
                                                        <h4 className="font-black text-slate-700 uppercase text-xs">{cat.name}</h4>
                                                        <span className="text-[9px] font-bold text-slate-400 uppercase">{cat.active ? 'Ativo' : 'Inativo'}</span>
                                                    </div>
                                                </div>
                                                <div className="flex gap-2 transition-opacity">
                                                    <button onClick={() => handleOpenCategoryModal(cat)} className="p-3 bg-primary-50/50 text-primary-400 hover:text-primary-600 hover:bg-white rounded-xl shadow-sm border border-transparent hover:border-primary-100 transition-all active:scale-95" title="Editar">
                                                        <Edit3 size={16} />
                                                    </button>
                                                    <button onClick={() => handleDeleteCategory(cat.id)} className="p-3 bg-rose-50/50 text-rose-400 hover:text-rose-600 hover:bg-white rounded-xl shadow-sm border border-transparent hover:border-rose-100 transition-all active:scale-95" title="Excluir">
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </>
                        )}

                        {activeTab === 'techs' && (
                            <div className="space-y-6 animate-fade-in font-poppins">
                                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-primary-50 rounded-xl flex items-center justify-center text-primary-600 border border-primary-100 shadow-sm">
                                            <Users size={20} />
                                        </div>
                                        <div>
                                            <h3 className="text-base font-semibold text-slate-800 leading-none">
                                                Estoque por Colaborador
                                            </h3>
                                            <p className="text-[10px] text-slate-400 font-medium mt-1 uppercase tracking-wider">Gestão de carga e cautelas técnico-operacionais</p>
                                        </div>
                                    </div>
                                    <Button
                                        onClick={() => {
                                            setTransferData({ 
                                                itemId: '', 
                                                techId: selectedTech?.id || '', 
                                                quantity: '', 
                                                direction: selectedTech ? 'return' : 'transfer' 
                                            });
                                            setIsTransferModalOpen(true);
                                        }}
                                        variant="primary"
                                        className="px-6 py-2.5 bg-[#1c2d4f] hover:bg-[#253a66] text-white rounded-xl text-xs font-bold shadow-lg shadow-primary-900/10 gap-2"
                                    >
                                        <Layers size={16} /> Movimentação de Carga
                                    </Button>
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
                                    {/* Sidebar Colaboradores */}
                                    <div className="lg:col-span-1 space-y-4 bg-white border border-slate-200 rounded-2xl p-4 shadow-sm h-full max-h-[calc(100vh-280px)] flex flex-col">
                                        <div className="relative">
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                                            <input
                                                type="text"
                                                placeholder="Localizar colaborador..."
                                                value={techSearch}
                                                onChange={e => setTechSearch(e.target.value)}
                                                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 text-xs font-medium text-slate-700 outline-none focus:ring-2 focus:ring-primary-100 transition-all"
                                            />
                                        </div>
                                        <div className="flex-1 overflow-y-auto pr-1 space-y-2 custom-scrollbar">
                                            {techs
                                                .filter(t => t.name.toLowerCase().includes(techSearch.toLowerCase()))
                                                .map(t => (
                                                    <button
                                                        key={t.id}
                                                        onClick={async () => {
                                                            setSelectedTech(t);
                                                            const stock = await DataService.getTechStock(t.id);
                                                            setTechStock(stock);
                                                        }}
                                                        className={`w-full p-3 rounded-xl border text-left transition-all group relative overflow-hidden flex items-center gap-3 ${selectedTech?.id === t.id ? 'bg-primary-50 border-primary-200 shadow-sm' : 'bg-white border-transparent hover:bg-slate-50'}`}
                                                    >
                                                        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-transform group-hover:scale-105 ${selectedTech?.id === t.id ? 'bg-[#1c2d4f] text-white shadow-md shadow-primary-900/20' : 'bg-slate-100 text-slate-500'}`}>
                                                            {t.name.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase()}
                                                        </div>
                                                        <div className="min-w-0 pr-4">
                                                            <p className={`text-[11px] font-bold leading-none mb-1.5 truncate uppercase ${selectedTech?.id === t.id ? 'text-primary-900' : 'text-slate-700'}`}>{t.name}</p>
                                                            <div className="flex items-center gap-1.5">
                                                                <span className={`w-1.5 h-1.5 rounded-full ${t.role === 'ADMIN' ? 'bg-rose-400' : 'bg-emerald-400'}`} />
                                                                <p className="text-[9px] font-semibold text-slate-400 flex items-center gap-1">
                                                                    {t.role === 'ADMIN' ? 'GESTÃO' : 'OPERACIONAL'}
                                                                </p>
                                                            </div>
                                                        </div>
                                                        {selectedTech?.id === t.id && (
                                                            <div className="ml-auto">
                                                                <RefreshCw size={12} className="text-primary-default animate-pulse" />
                                                            </div>
                                                        )}
                                                    </button>
                                                ))}
                                        </div>
                                    </div>

                                    {/* Inventário do Técnico */}
                                    <div className="lg:col-span-3 space-y-6 flex flex-col h-full max-h-[calc(100vh-280px)]">
                                        {selectedTech ? (
                                            <>
                                                <div className="bg-[#1c2d4f] rounded-2xl p-6 text-white shadow-xl shadow-primary-900/10 relative overflow-hidden shrink-0">
                                                    <div className="relative z-10 flex items-center justify-between">
                                                        <div className="flex items-center gap-4">
                                                            <div className="w-14 h-14 bg-white/10 backdrop-blur-md rounded-2xl flex items-center justify-center border border-white/20">
                                                                <Box className="text-white" size={28} />
                                                            </div>
                                                            <div>
                                                                <p className="text-[10px] font-bold uppercase text-blue-200 mb-1 leading-none">Cautela de Carga Ativa</p>
                                                                <h4 className="text-xl font-bold uppercase tracking-tight leading-none">{selectedTech.name}</h4>
                                                            </div>
                                                        </div>
                                                        <div className="text-right flex flex-col items-end">
                                                            <p className="text-[10px] font-bold uppercase text-blue-200 mb-1 leading-none">Itens Custodiados</p>
                                                            <p className="text-4xl font-black">{techStock.length}</p>
                                                        </div>
                                                    </div>
                                                    <TrendingUp size={120} className="absolute right-[-20px] bottom-[-40px] text-white/5" />
                                                </div>

                                                <div className="bg-white border border-slate-200 shadow-lg shadow-slate-200/40 rounded-2xl overflow-hidden flex flex-col flex-1 min-h-0">
                                                    <div className="overflow-auto custom-scrollbar">
                                                        <table className="w-full text-left border-collapse">
                                                            <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 z-10">
                                                                <tr className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-none">
                                                                    <th className="px-6 py-4">Produto no Estoque Técnico</th>
                                                                    <th className="px-6 py-4 text-center">Quantidade</th>
                                                                    <th className="px-6 py-4 text-right">Referência SKU</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-slate-100">
                                                                {techStock.length === 0 ? (
                                                                    <tr>
                                                                        <td colSpan={3} className="py-24 text-center">
                                                                            <div className="flex flex-col items-center gap-3 opacity-30">
                                                                                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center">
                                                                                    <Package size={32} className="text-slate-400" />
                                                                                </div>
                                                                                <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Sem carga atribuída</p>
                                                                            </div>
                                                                        </td>
                                                                    </tr>
                                                                ) : techStock.map(ts => (
                                                                    <tr key={ts.id} className="hover:bg-slate-50 transition-colors group">
                                                                        <td className="px-6 py-4">
                                                                            <div className="flex flex-col">
                                                                                <span className="text-[11px] font-bold text-slate-800 uppercase tracking-tight group-hover:text-primary-600 transition-colors">{ts.item?.description}</span>
                                                                                <span className="text-[9px] font-medium text-slate-400 mt-1 uppercase tracking-wider">{ts.item?.category || 'Sem Categoria'}</span>
                                                                            </div>
                                                                        </td>
                                                                        <td className="px-6 py-4 text-center">
                                                                            <span className="inline-flex items-center justify-center min-w-[32px] h-8 px-3 bg-white border border-slate-200 text-slate-900 rounded-[10px] text-[11px] font-bold shadow-sm">
                                                                                {ts.quantity} {ts.item?.unit}
                                                                            </span>
                                                                        </td>
                                                                        <td className="px-6 py-4 text-right">
                                                                            <span className="text-[10px] font-mono font-bold text-slate-400 bg-slate-50 px-3 py-1 rounded-md border border-slate-100">#{ts.item?.code || '---'}</span>
                                                                        </td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </div>
                                            </>
                                        ) : (
                                            <div className="h-full flex flex-col items-center justify-center text-center p-12 bg-white border border-slate-200 rounded-2xl gap-4">
                                                <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center text-slate-300">
                                                    <Users size={40} />
                                                </div>
                                                <div>
                                                    <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Nenhum Responsável Selecionado</p>
                                                    <p className="text-xs text-slate-400 mt-2 max-w-[280px]">Selecione um colaborador à esquerda para gerenciar sua carga ativa e cautelas.</p>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'movements' && (() => {
                            const term = movSearch.toLowerCase();
                            const filtered = movements.filter(m => {
                                if (movTypeFilter !== 'ALL' && m.type !== movTypeFilter) return false;
                                if (movDateFrom) { const d = new Date(m.created_at); if (d < new Date(movDateFrom)) return false; }
                                if (movDateTo) { const d = new Date(m.created_at); const end = new Date(movDateTo); end.setHours(23, 59, 59); if (d > end) return false; }
                                if (term) {
                                    const haystack = [
                                        m.stock_items?.description, m.stock_items?.code,
                                        m.technician?.name, m.executor?.name,
                                        m.reference_id, m.source, m.destination
                                    ].filter(Boolean).join(' ').toLowerCase();
                                    if (!haystack.includes(term)) return false;
                                }
                                return true;
                            }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
                            return (
                                <div className="space-y-6">
                                    <h3 className="text-xl font-black text-slate-800 uppercase flex items-center gap-3">
                                        <Scale className="text-slate-800" /> Auditoria de Movimentações
                                    </h3>
                                    {/* Filtros */}
                                    <div className="flex flex-wrap items-center gap-3">
                                        <div className="relative flex-1 min-w-[180px]">
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                                            <input
                                                type="text" placeholder="Buscar item, técnico, OS..."
                                                value={movSearch} onChange={e => setMovSearch(e.target.value)}
                                                className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-[10px] font-bold text-slate-700 outline-none focus:ring-4 focus:ring-primary-100 transition-all shadow-sm"
                                            />
                                        </div>
                                        <div className="flex items-center bg-white border border-slate-200 rounded-xl px-3 shadow-lg shadow-slate-200/50 h-[38px]">
                                            <Filter size={12} className="text-slate-400 mr-2" />
                                            <select value={movTypeFilter} onChange={e => setMovTypeFilter(e.target.value)} className="bg-transparent text-[10px] font-black uppercase text-slate-600 outline-none cursor-pointer">
                                                <option value="ALL">Todos Tipos</option>
                                                <option value="TRANSFER">Transferência</option>
                                                <option value="CONSUMPTION">Consumo</option>
                                                <option value="RESTOCK">Entrada</option>
                                                <option value="RETURN">Devolução</option>
                                            </select>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <input type="date" value={movDateFrom} onChange={e => handleDateValidation(e.target.value, movDateTo)} className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-[10px] font-bold text-slate-600 outline-none focus:ring-4 focus:ring-primary-100 shadow-sm h-[38px]" />
                                            <span className="text-[9px] font-black text-slate-400">ATÉ</span>
                                            <input type="date" value={movDateTo} onChange={e => handleDateValidation(movDateFrom, e.target.value)} className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-[10px] font-bold text-slate-600 outline-none focus:ring-4 focus:ring-primary-100 shadow-sm h-[38px]" />
                                        </div>
                                        {(movSearch || movTypeFilter !== 'ALL' || movDateFrom || movDateTo) && (
                                            <button onClick={() => { setMovSearch(''); setMovTypeFilter('ALL'); setMovDateFrom(''); setMovDateTo(''); }} className="px-3 py-1.5 text-[9px] font-bold uppercase text-slate-400 hover:text-rose-500 transition-colors">
                                                Limpar
                                            </button>
                                        )}
                                        <span className="text-[9px] font-bold text-slate-400 ml-auto">{filtered.length} registro(s)</span>
                                    </div>
                                    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                                        <table className="w-full text-left">
                                            <thead className="sticky top-0 bg-slate-200/60 backdrop-blur-md border-b border-slate-300 z-10 shadow-sm font-poppins">
                                                <tr className="text-[10px] font-semibold text-slate-600 tracking-tight text-left uppercase">
                                                    <th className="px-6 py-3 text-center">Data</th>
                                                    <th className="px-6 py-3 text-center">Tipo</th>
                                                    <th className="px-6 py-3">Item</th>
                                                    <th className="px-6 py-3 text-center">Qtd.</th>
                                                    <th className="px-6 py-3">Técnico / Admin</th>
                                                    <th className="px-6 py-3">Referência (OS/ORC)</th>
                                                    <th className="px-6 py-3 text-center">Fluxo</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {filtered.length === 0 ? (
                                                    <tr><td colSpan={7} className="py-16 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">Nenhuma movimentação encontrada</td></tr>
                                                ) : filtered.map(m => (
                                                    <tr key={m.id} className="text-[11px] hover:bg-slate-50/50">
                                                        <td className="px-6 py-1.5 text-center text-slate-500 font-bold">{new Date(m.created_at).toLocaleString('pt-BR')}</td>
                                                        <td className="px-6 py-1.5 text-center">
                                                            <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${m.type === 'TRANSFER' ? 'bg-primary-50 text-primary-600' :
                                                                m.type === 'CONSUMPTION' ? 'bg-amber-100 text-amber-700' :
                                                                    'bg-emerald-50 text-emerald-600'
                                                                }`}>
                                                                {m.type === 'TRANSFER' ? 'Transferência' : m.type === 'CONSUMPTION' ? 'Consumo' : m.type === 'RETURN' ? 'Devolução' : 'Entrada'}
                                                            </span>
                                                        </td>
                                                        <td className="px-6 py-1.5">
                                                            <p className="font-black text-slate-800 uppercase ">{m.stock_items?.description}</p>
                                                            <p className="text-[9px] text-slate-400">Cód: {m.stock_items?.code}</p>
                                                        </td>
                                                        <td className="px-6 py-1.5 text-center font-bold text-slate-900">{m.quantity}</td>
                                                        <td className="px-6 py-1.5">
                                                            <div className="flex flex-col">
                                                                <span className="font-bold text-slate-700 uppercase truncate max-w-[120px]">{m.technician?.name || m.executor?.name || '-'}</span>
                                                                {m.executor?.name && m.executor.name !== m.technician?.name && (
                                                                    <span className="text-[9px] text-slate-400 italic">Por: {m.executor.name}</span>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-1.5">
                                                            <span className="font-black text-primary-600 text-[10px]">{m.reference_id || '-'}</span>
                                                        </td>
                                                        <td className="px-6 py-1.5 text-center text-[10px] font-bold text-slate-400 ">
                                                            {m.source} → {m.destination}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            );
                        })()}
                    </div>
                )}
            </div>

            {/* RESTOCK MODAL */}
            {isRestockModalOpen && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in">
                    <div className="bg-white rounded-xl w-full max-w-lg shadow-2xl overflow-hidden animate-scale-up border border-slate-200">
                        <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-white">
                            <h2 className="text-base font-semibold text-slate-900 font-poppins flex items-center gap-2">
                                <Package className="text-primary-600" size={20} /> Entrada Rápida
                            </h2>
                            <button onClick={() => setIsRestockModalOpen(false)} className="text-slate-400 hover:text-rose-500 transition-colors">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="p-8 space-y-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Buscar Item (Cód. Interno ou Fabricante)</label>
                                <div className="relative">
                                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                    <input
                                        autoFocus
                                        value={restockSearch}
                                        onChange={e => handleRestockSearch(e.target.value)}
                                        placeholder="Digite o código exato..."
                                        className="w-full pl-12 pr-4 py-3 rounded-xl border border-slate-200 bg-slate-50/30 text-slate-700 font-bold outline-none focus:ring-2 focus:ring-primary-100 transition-all"
                                    />
                                </div>
                            </div>

                            {selectedRestockItem ? (
                                <div className="bg-primary-50/50 rounded-2xl p-6 border border-primary-100 space-y-4 animate-fade-in">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <h3 className="font-black text-slate-700 uppercase text-sm">{selectedRestockItem.description}</h3>
                                            <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">Cód: {selectedRestockItem.code} • Atual: {selectedRestockItem.quantity} {selectedRestockItem.unit}</p>
                                        </div>
                                        <div className="px-3 py-1 bg-white rounded-lg border border-primary-100 text-[10px] font-black text-primary-600 shadow-sm">
                                            ITEM ENCONTRADO
                                        </div>
                                    </div>

                                    <form onSubmit={handleRestockSubmit} className="pt-4 border-t border-primary-100/50 flex items-end gap-3">
                                        <div className="flex-1 space-y-1.5">
                                            <label className="text-[9px] font-black text-primary-400 uppercase tracking-widest">Qtd. Entrada (+)</label>
                                            <input
                                                type="number"
                                                value={restockQuantity}
                                                onChange={e => setRestockQuantity(e.target.value)}
                                                className="w-full px-4 py-2 rounded-xl border border-primary-200 text-primary-900 font-black outline-none focus:ring-2 focus:ring-primary-200"
                                                placeholder="0"
                                                min="1"
                                                required
                                            />
                                        </div>
                                        <Button
                                            type="submit"
                                            variant="primary"
                                            className="px-6 py-2.5 bg-[#1c2d4f] hover:bg-[#253a66] text-white rounded-xl font-black text-xs uppercase shadow-lg shadow-primary-900/20 transition-all active:scale-95"
                                        >
                                            Confirmar Entrada
                                        </Button>
                                    </form>
                                </div>
                            ) : restockSearch && (
                                <div className="text-center py-8 text-slate-400">
                                    <p className="text-xs font-bold uppercase">Nenhum item encontrado com este código.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ITEM MODAL (Pattern igual a OS Atividades) */}
            {isModalOpen && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in">
                    <div className="bg-white rounded-xl w-full max-w-6xl max-h-[92vh] shadow-2xl flex flex-col overflow-hidden border border-slate-200">
                        {/* HEADER (Estilo Atividades) */}
                        <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-white shrink-0">
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-center text-slate-400 transition-colors">
                                    <Package size={20} />
                                </div>
                                <div>
                                    <div className="flex items-center gap-3">
                                        <h2 className="text-base font-semibold text-slate-900 font-poppins">
                                            {editingItem ? `Produto SKU #${editingItem.code}` : 'Novo Cadastro de Produto'}
                                        </h2>
                                        {editingItem && (
                                            <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${(editingItem.quantity || 0) > (editingItem.minQuantity || 0) ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-rose-50 text-rose-600 border-rose-100'}`}>
                                                {(editingItem.quantity || 0) > (editingItem.minQuantity || 0) ? 'Estoque Regular' : 'Atenção: Baixo Estoque'}
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                                        {formData.description || 'Gestão de Inventário e Patrimônio • Nexus Pro'}
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                <Button
                                    onClick={handleSubmit}
                                    form="stock-item-form"
                                    variant="primary"
                                    className="h-9 px-5 bg-[#1c2d4f] hover:bg-[#253a66] text-white text-xs font-bold rounded-lg shadow-md shadow-primary-500/20 transition-all flex items-center gap-2"
                                >
                                    <Save size={14} /> Salvar Alterações
                                </Button>
                                <div className="h-6 w-px bg-slate-200 mx-2"></div>
                                <Button variant="ghost" onClick={() => setIsModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-900 transition-all">
                                    <X size={20} />
                                </Button>
                            </div>
                        </div>

                        {/* TABS (Igual a Atividades) */}
                        <div className="px-6 border-b border-slate-200 bg-white flex gap-6 shrink-0 overflow-x-auto">
                            {[
                                { id: 'dados', label: 'dados gerais', icon: LayoutDashboard },
                                { id: 'financial', label: 'financeiro', icon: DollarSign },
                                { id: 'logs', label: 'movimentações', icon: History }
                            ].map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => setModalTab(tab.id as any)}
                                    className={`flex items-center gap-2 py-4 text-xs font-medium border-b-2 transition-all whitespace-nowrap font-poppins uppercase tracking-wider
                                        ${modalTab === tab.id ? 'border-primary-500 text-primary-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                                >
                                    <tab.icon size={15} /> {tab.label}
                                </button>
                            ))}
                        </div>

                        {/* BODY */}
                        <div className="flex-1 overflow-y-auto p-8 bg-slate-50/50 custom-scrollbar">
                            <form onSubmit={handleSubmit} id="stock-item-form">
                                {modalTab === 'dados' && (
                                    <div className="grid grid-cols-12 gap-8">
                                        <div className="col-span-12 lg:col-span-8 space-y-6">
                                            <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm space-y-6">
                                                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                                                    <Info size={18} className="text-slate-400" /> Identificação e Localização
                                                </h3>
                                                
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                    <div className="space-y-1.5">
                                                        <label className="text-[11px] font-medium text-slate-400 block px-1">Código SKU / Interno</label>
                                                        <div className="relative group">
                                                            <Input
                                                                value={formData.code}
                                                                onChange={e => setFormData({ ...formData, code: e.target.value })}
                                                                className="rounded-lg border-slate-200 font-bold bg-slate-50/30 focus:bg-white h-11 text-sm"
                                                                required
                                                            />
                                                            <button type="button" onClick={generateCode} className="absolute right-2 top-1/2 -translate-y-1/2 text-primary-400 p-2 hover:bg-primary-50 rounded-md"><Wand2 size={16} /></button>
                                                        </div>
                                                    </div>
                                                    <div className="space-y-1.5">
                                                        <label className="text-[11px] font-medium text-slate-400 block px-1">Código de Barras / EAN</label>
                                                        <Input
                                                            value={formData.externalCode}
                                                            onChange={e => setFormData({ ...formData, externalCode: e.target.value })}
                                                            className="rounded-lg border-slate-200 h-11 text-sm"
                                                            icon={<Barcode size={16} className="text-slate-400" />}
                                                        />
                                                    </div>
                                                </div>

                                                <div className="space-y-1.5">
                                                    <label className="text-[11px] font-medium text-slate-400 block px-1">Nome / Descrição Curta</label>
                                                    <Input
                                                        value={formData.description}
                                                        onChange={e => setFormData({ ...formData, description: e.target.value })}
                                                        className="rounded-lg border-slate-200 font-semibold h-11 text-sm"
                                                        required
                                                    />
                                                </div>

                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                    <div className="space-y-1.5">
                                                        <label className="text-[11px] font-medium text-slate-400 block px-1">Categoria</label>
                                                        <select value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-primary-100 transition-all uppercase cursor-pointer">
                                                            <option value="">Sem Categoria</option>
                                                            {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                                                        </select>
                                                    </div>
                                                    <div className="space-y-1.5">
                                                        <label className="text-[11px] font-medium text-slate-400 block px-1">Unidade</label>
                                                        <select value={formData.unit} onChange={e => setFormData({ ...formData, unit: e.target.value as any })} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-primary-100 transition-all uppercase cursor-pointer">
                                                            <option value="UN">Unidade (UN)</option>
                                                            <option value="CX">Caixa (CX)</option>
                                                            <option value="M">Metros (M)</option>
                                                            <option value="KG">Quilos (KG)</option>
                                                            <option value="PAR">Par (PAR)</option>
                                                        </select>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Right Column: Status Summary */}
                                        <div className="col-span-12 lg:col-span-4 space-y-6">
                                            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                                                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-tight mb-4 flex items-center gap-2"><Box size={16} className="text-slate-400" /> Controle Físico</h3>
                                                <div className="space-y-4">
                                                    <div className="flex justify-between items-center pb-3 border-b border-slate-100">
                                                        <span className="text-xs font-semibold text-slate-400">Posição / Local</span>
                                                        <input value={formData.location} onChange={e => setFormData({...formData, location: e.target.value})} className="text-xs font-bold text-slate-700 text-right bg-transparent outline-none" placeholder="Ex: Prateleira A" />
                                                    </div>
                                                    <div className="p-4 bg-emerald-50 rounded-lg border border-emerald-100">
                                                        <div className="flex justify-between items-center mb-1">
                                                            <span className="text-[10px] font-bold text-emerald-600 uppercase">Quantidade Atual</span>
                                                        </div>
                                                        <input type="number" value={formData.quantity} onChange={e => setFormData({...formData, quantity: e.target.value})} className="text-2xl font-black text-emerald-700 bg-transparent outline-none w-full" />
                                                    </div>
                                                    <div className="p-4 bg-rose-50 rounded-lg border border-rose-100">
                                                        <div className="flex justify-between items-center mb-1">
                                                            <span className="text-[10px] font-bold text-rose-600 uppercase">Mínimo (Alerta)</span>
                                                        </div>
                                                        <input type="number" value={formData.minQuantity} onChange={e => setFormData({...formData, minQuantity: e.target.value})} className="text-2xl font-black text-rose-700 bg-transparent outline-none w-full" />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {modalTab === 'financial' && (
                                    <div className="max-w-4xl mx-auto space-y-8">
                                        <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm grid grid-cols-1 md:grid-cols-2 gap-12">
                                            <div className="space-y-6">
                                                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                                                    <DollarSign size={18} className="text-slate-400" /> Custos de Aquisição
                                                </h3>
                                                <div className="space-y-4">
                                                    <div className="space-y-1.5">
                                                        <label className="text-[11px] font-medium text-slate-400 block px-1">Preço de Compra (Líquido)</label>
                                                        <div className="relative">
                                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">R$</span>
                                                            <input type="number" step="0.01" value={formData.costPrice} onChange={e => setFormData({...formData, costPrice: e.target.value})} className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold outline-none focus:ring-2 focus:ring-primary-100" />
                                                        </div>
                                                    </div>
                                                    <div className="space-y-1.5">
                                                        <label className="text-[11px] font-medium text-slate-400 block px-1">Frete / Entregas</label>
                                                        <div className="relative">
                                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">R$</span>
                                                            <input type="number" step="0.01" value={formData.freightCost} onChange={e => setFormData({...formData, freightCost: e.target.value})} className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold outline-none focus:ring-2 focus:ring-primary-100" />
                                                        </div>
                                                    </div>
                                                    <div className="space-y-1.5">
                                                        <label className="text-[11px] font-medium text-slate-400 block px-1">Carga Tributária (%)</label>
                                                        <div className="relative">
                                                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">%</span>
                                                            <input type="number" step="0.1" value={formData.taxPercent} onChange={e => setFormData({...formData, taxPercent: e.target.value})} className="w-full pl-4 pr-9 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold outline-none focus:ring-2 focus:ring-primary-100" />
                                                        </div>
                                                    </div>
                                                    <div className="p-4 bg-[#1c2d4f] text-white rounded-lg shadow-inner">
                                                        <p className="text-[10px] font-bold uppercase opacity-60">Custo Final Estimado</p>
                                                        <p className="text-xl font-black">R$ {calculateTotalCost(formData).toFixed(2)}</p>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="space-y-6">
                                                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                                                    <TrendingUp size={18} className="text-emerald-500" /> Estratégia de Venda
                                                </h3>
                                                <div className="space-y-4">
                                                    <div className="space-y-1.5">
                                                        <label className="text-[11px] font-medium text-slate-400 block px-1">Preço Sugerido ao Público</label>
                                                        <div className="relative">
                                                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-500 text-lg font-black">R$</span>
                                                            <input type="number" step="0.01" value={formData.sellPrice} onChange={e => setFormData({...formData, sellPrice: e.target.value})} className="w-full pl-12 pr-4 py-4 bg-emerald-50 border-2 border-emerald-100 rounded-xl text-2xl font-black text-emerald-700 outline-none focus:border-emerald-300" />
                                                        </div>
                                                    </div>
                                                    <div className="p-6 bg-slate-900 rounded-xl relative overflow-hidden">
                                                        <div className="relative z-10">
                                                            <p className="text-[10px] font-bold uppercase text-slate-400">Margem Comercial</p>
                                                            <p className={`text-4xl font-black ${calculateMargin(formData) > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                                {calculateMargin(formData).toFixed(1)}%
                                                            </p>
                                                        </div>
                                                        <div className="absolute right-[-10px] bottom-[-10px] opacity-10">
                                                            <TrendingUp size={100} className="text-white" />
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {modalTab === 'logs' && (
                                    <div className="max-w-4xl mx-auto space-y-6">
                                        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                                            <table className="w-full text-left">
                                                <thead className="bg-slate-50 border-b border-slate-200">
                                                    <tr className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                                        <th className="px-6 py-4">Data/Hora</th>
                                                        <th className="px-6 py-4">Operação</th>
                                                        <th className="px-6 py-4">Responsável</th>
                                                        <th className="px-6 py-4 text-center">Volume</th>
                                                        <th className="px-6 py-4 text-right">Saldo Final</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100">
                                                    {editingItem && movements.filter(m => m.stock_item_id === editingItem.id).length === 0 ? (
                                                        <tr>
                                                            <td colSpan={5} className="py-12 text-center text-slate-400 text-xs italic">Nenhum histórico disponível para este item no momento.</td>
                                                        </tr>
                                                    ) : (
                                                        movements
                                                            .filter(m => m.stock_item_id === editingItem?.id)
                                                            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                                                            .map(m => (
                                                                <tr key={m.id} className="text-[12px] hover:bg-slate-50 transition-colors">
                                                                    <td className="px-6 py-4 text-slate-500 font-medium">
                                                                        {new Date(m.created_at).toLocaleString('pt-BR')}
                                                                    </td>
                                                                    <td className="px-6 py-4">
                                                                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase shadow-sm ${
                                                                            m.type === 'RESTOCK' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 
                                                                            m.type === 'CONSUMPTION' ? 'bg-rose-50 text-rose-600 border border-rose-100' :
                                                                            m.type === 'TRANSFER' ? 'bg-primary-50 text-primary-600 border border-primary-100' :
                                                                            'bg-amber-50 text-amber-600 border border-amber-100'
                                                                        }`}>
                                                                            {m.type === 'RESTOCK' ? 'Entrada' : m.type === 'CONSUMPTION' ? 'Consumo' : m.type === 'TRANSFER' ? 'Transferência' : 'Devolução'}
                                                                        </span>
                                                                    </td>
                                                                    <td className="px-6 py-4">
                                                                        <div className="flex flex-col">
                                                                            <span className="font-bold text-slate-700 uppercase">{m.technician?.name || m.executor?.name || 'Sistema'}</span>
                                                                            <span className="text-[9px] text-slate-400 font-medium">{m.source} → {m.destination}</span>
                                                                        </div>
                                                                    </td>
                                                                    <td className="px-6 py-4 text-center font-black text-slate-900">
                                                                        <span className={m.quantity > 0 && m.type === 'RESTOCK' ? 'text-emerald-600' : 'text-slate-900'}>
                                                                            {m.quantity > 0 && m.type === 'RESTOCK' ? `+${m.quantity}` : m.quantity}
                                                                        </span>
                                                                    </td>
                                                                    <td className="px-6 py-4 text-right">
                                                                        <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded">Ref: {m.reference_id || 'ID-' + m.id.substring(0, 5).toUpperCase()}</span>
                                                                    </td>
                                                                </tr>
                                                            ))
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}
                            </form>
                        </div>
                    </div>
                </div>
            )}

            {/* CATEGORY MODAL */}
            {isCategoryModalOpen && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/40 backdrop-blur-xl p-4 sm:pt-20 animate-fade-in">
                    <div className="bg-white rounded-[2rem] w-full max-w-md shadow-2xl overflow-hidden animate-scale-up border border-white/50">
                        <div className="px-8 py-6 border-b border-slate-200 flex justify-between items-center bg-white shrink-0">
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600 border border-emerald-100 shadow-sm">
                                    <Tag size={20} />
                                </div>
                                <div>
                                    <h2 className="text-sm font-black text-slate-900 uppercase tracking-tight leading-none">
                                        {editingCategory ? 'Modificar Categoria' : 'Nova Classificação'}
                                    </h2>
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">
                                        Nexus Organizational Structure
                                    </p>
                                </div>
                            </div>
                            <button onClick={() => setIsCategoryModalOpen(false)} className="p-2 text-slate-400 hover:text-rose-500 rounded-lg hover:bg-rose-50 transition-all">
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleCategorySubmit} className="p-8 space-y-6">
                            <div className="space-y-1.5">
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Nome da Categoria</span>
                                <Input
                                    value={categoryFormData.name}
                                    onChange={e => setCategoryFormData({ ...categoryFormData, name: e.target.value })}
                                    className="rounded-xl font-bold"
                                    placeholder="Ex: Elétrica, Hidráulica..."
                                    required
                                    autoFocus
                                />
                            </div>
                            <div className="pt-2 flex justify-end gap-3">
                                <Button type="button" onClick={() => setIsCategoryModalOpen(false)} variant="ghost" className="text-xs">
                                    Cancelar
                                </Button>
                                <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-6 rounded-xl">
                                    Salvar
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            {/* TRANSFER MODAL */}
            {isTransferModalOpen && (
                <div className="fixed inset-0 z-[203] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in">
                    <div className="bg-white rounded-xl w-full max-w-lg shadow-2xl overflow-hidden animate-scale-up border border-slate-200">
                        <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-white">
                            <h2 className="text-base font-semibold text-slate-900 font-poppins flex items-center gap-3">
                                <Box className="text-primary-600" size={20} /> Movimentação Logística
                            </h2>
                            <button onClick={() => setIsTransferModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-900 transition-all rounded-lg">
                                <X size={20} />
                            </button>
                        </div>

                        <form className="p-8 space-y-6" onSubmit={async (e) => {
                            e.preventDefault();
                            if (!transferData.itemId || !transferData.techId || !transferData.quantity) return;
                            try {
                                if (transferData.direction === 'return') {
                                    await DataService.returnFromTech(transferData.techId, transferData.itemId, Number(transferData.quantity));
                                    alert('Item devolvido ao estoque geral com sucesso!');
                                } else {
                                    await DataService.transferToTech(transferData.techId, transferData.itemId, Number(transferData.quantity));
                                    alert('Transferência ao técnico concluída!');
                                }
                                setIsTransferModalOpen(false);
                                loadItems(currentPage, searchTerm, categoryFilter, statusFilter);
                                loadMovements();
                                if (selectedTech?.id === transferData.techId) {
                                    const stock = await DataService.getTechStock(selectedTech.id);
                                    setTechStock(stock);
                                }
                            } catch (error: any) {
                                alert(error.message || 'Erro ao transferir.');
                            }
                        }}>
                            <div className="space-y-4">

                                {/* Seleção de Direção da Operação */}
                                <div className="flex bg-slate-100 p-1.5 rounded-xl">
                                    <button
                                        type="button"
                                        className={`flex-1 py-2 text-[10px] font-black uppercase rounded-lg transition-all ${transferData.direction === 'transfer' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                                        onClick={() => setTransferData({ ...transferData, direction: 'transfer' })}
                                    >
                                        Enviar para Técnico
                                    </button>
                                    <button
                                        type="button"
                                        className={`flex-1 py-2 text-[10px] font-black uppercase rounded-lg transition-all ${transferData.direction === 'return' ? 'bg-white text-amber-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                                        onClick={() => setTransferData({ ...transferData, direction: 'return' })}
                                    >
                                        Devolver ao Estoque Geral
                                    </button>
                                </div>

                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Item Envolvido</label>
                                    <select
                                        required
                                        className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-primary-100"
                                        value={transferData.itemId}
                                        onChange={e => setTransferData({ ...transferData, itemId: e.target.value })}
                                    >
                                        <option value="">Selecione o Item</option>
                                        {transferData.direction === 'return' ? (
                                            // Se for devolução, mostramos apenas o que o técnico selecionado possui no estoque técnico
                                            techStock.map(ts => (
                                                <option key={ts.item?.id || ts.stock_item_id} value={ts.item?.id || ts.stock_item_id}>
                                                    {ts.item?.description} ({ts.quantity} {ts.item?.unit} em posse do colaborador)
                                                </option>
                                            ))
                                        ) : (
                                            // Se for transferência normal, mostramos o estoque geral disponível
                                            items.map(i => (
                                                <option key={i.id} value={i.id}>
                                                    {i.description} ({i.quantity} {i.unit} disp. no Geral)
                                                </option>
                                            ))
                                        )}
                                    </select>
                                </div>

                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Técnico Envolvido</label>
                                    <select
                                        required
                                        className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-primary-100"
                                        value={transferData.techId}
                                        onChange={async (e) => {
                                            const newTechId = e.target.value;
                                            setTransferData({ ...transferData, techId: newTechId, itemId: '' });
                                            if (newTechId && transferData.direction === 'return') {
                                                const stock = await DataService.getTechStock(newTechId);
                                                setTechStock(stock);
                                            }
                                        }}
                                    >
                                        <option value="">Selecione o Técnico</option>
                                        {techs.map(t => (
                                            <option key={t.id} value={t.id}>{t.name}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Quantidade a Transferir</label>
                                    <input
                                        type="number"
                                        required
                                        min="0.1"
                                        step="0.1"
                                        className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-amber-100"
                                        value={transferData.quantity}
                                        onChange={e => setTransferData({ ...transferData, quantity: e.target.value })}
                                    />
                                </div>
                            </div>

                            <Button
                                type="submit"
                                variant="primary"
                                className="w-full py-4 bg-[#1c2d4f] hover:bg-[#253a66] text-white rounded-xl font-black uppercase text-xs tracking-widest shadow-xl shadow-primary-900/20 transition-all active:scale-95"
                            >
                                {transferData.direction === 'transfer' ? 'Confirmar Transferência' : 'Confirmar Devolução'}
                            </Button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
