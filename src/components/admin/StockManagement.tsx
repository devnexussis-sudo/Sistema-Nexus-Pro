
import { AlertTriangle, Barcode, Box, Camera, DollarSign, Edit3, Filter, History, Info, Layers, LayoutDashboard, List, Loader2, Package, Plus, RefreshCw, Save, Scale, Search, Tag, Trash2, TrendingDown, TrendingUp, Users, Wand2, X, Image as ImageIcon, Printer, QrCode, ClipboardCheck, CheckCircle, FileText } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { DataService } from '../../services/dataService';
import { StorageService } from '../../services/storageService';
import { TenantService } from '../../services/tenantService';
import { Category, StockItem } from '../../types';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Pagination } from '../ui/Pagination';

export const StockManagement: React.FC = () => {
    const { isAuthLoading, session } = useAuth();

    // Application State
    const [activeTab, setActiveTab] = useState<'items' | 'categories' | 'techs' | 'movements' | 'balance'>('items');

    // --- Items State ---
    const [items, setItems] = useState<StockItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [showFilters, setShowFilters] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<StockItem | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [imageUploading, setImageUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Filters
    const [categoryFilter, setCategoryFilter] = useState('ALL');
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [availableCategories, setAvailableCategories] = useState<Category[]>([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalItemsCount, setTotalItemsCount] = useState(0);
    const abortControllerRef = useRef<AbortController | null>(null);
    const isFetching = useRef<boolean>(false);
    const ITEMS_PER_PAGE = 20;

    // --- Selection & Export State ---
    const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

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
    const [itemMovements, setItemMovements] = useState<any[]>([]);
    const [movSearch, setMovSearch] = useState('');
    const [movTypeFilter, setMovTypeFilter] = useState('ALL');
    const getDefaultDates = () => {
        const today = new Date().toISOString().split('T')[0];
        return { start: today, end: today };
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
    const [techStockSearch, setTechStockSearch] = useState('');
    const [transferItemSearch, setTransferItemSearch] = useState('');
    const [transferTechSearch, setTransferTechSearch] = useState('');
    const [modalTab, setModalTab] = useState<'dados' | 'financial' | 'logs'>('dados');

    // --- Balance State ---
    const [stagedBalances, setStagedBalances] = useState<Record<string, { newQty: number, item: StockItem }>>({});
    const [isBalanceReportModalOpen, setIsBalanceReportModalOpen] = useState(false);
    const [balanceReports, setBalanceReports] = useState<any[]>([]);
    const [loadingReports, setLoadingReports] = useState(false);
    const [reportDateFrom, setReportDateFrom] = useState('');
    const [reportDateTo, setReportDateTo] = useState('');
    const [printModalOpen, setPrintModalOpen] = useState(false);
    const [printConfig, setPrintConfig] = useState({ quantity: 1, type: 'a4_maxprint_33', companyName: 'NEXUS PRO' });

    const handleBatchBalanceSave = async () => {
        const keys = Object.keys(stagedBalances);
        if (keys.length === 0) return;

        if (!confirm(`Deseja confirmar o balanço de ${keys.length} item(ns)? Uma auditoria será gerada para o lote.`)) return;

        const referenceId = 'BALANCO-' + new Date().getTime().toString().slice(-6);
        const user = await DataService.getCurrentUser();
        const tenantId = user?.tenantId || DataService.getCurrentTenantId();

        try {
            const movementsToInsert = [];
            for (const id of keys) {
                const { newQty, item } = stagedBalances[id];
                const currentQty = Number(item.quantity) || 0;
                const diff = newQty - currentQty;

                if (diff !== 0) {
                    await DataService.updateStockItem({
                        ...item,
                        quantity: newQty,
                        lastRestockDate: diff > 0 ? new Date().toISOString() : item.lastRestockDate
                    });

                    if (tenantId) {
                        movementsToInsert.push({
                            tenant_id: tenantId,
                            stock_item_id: item.id,
                            type: diff > 0 ? 'RESTOCK' : 'CONSUMPTION',
                            quantity: Math.abs(diff),
                            created_by: user?.id,
                            reference_id: `${referenceId}|${currentQty}|${newQty}`
                        });
                    }
                }
            }

            if (movementsToInsert.length > 0) {
                const { error: insertError } = await DataService.getServiceClient()
                    .from('stock_movements')
                    .insert(movementsToInsert);
                if (insertError) {
                    console.error('Erro no Supabase ao inserir movimentos:', insertError);
                    throw new Error(insertError.message || 'Falha ao registrar auditoria no banco de dados.');
                }
            }

            setStagedBalances({});
            alert('Auditoria de balanço salva com sucesso!');
            loadItems(currentPage, searchTerm, categoryFilter, statusFilter);
            loadMovements();
        } catch (error: any) {
            alert('Erro ao salvar o balanço: ' + (error.message || 'Falha desconhecida'));
            console.error(error);
        }
    };

    const fetchBalanceReports = async () => {
        setLoadingReports(true);
        try {
            const user = await DataService.getCurrentUser();
            const tenantId = user?.tenantId || DataService.getCurrentTenantId();
            if (!tenantId) return;

            let query = DataService.getServiceClient()
                .from('stock_movements')
                .select(`
                    *,
                    stock_items (*)
                `)
                .eq('tenant_id', tenantId)
                .like('reference_id', 'BALANCO-%')
                .order('created_at', { ascending: false });

            if (reportDateFrom) {
                query = query.gte('created_at', new Date(reportDateFrom).toISOString());
            }
            if (reportDateTo) {
                const end = new Date(reportDateTo);
                end.setHours(23, 59, 59, 999);
                query = query.lte('created_at', end.toISOString());
            }

            const { data, error } = await query;
            
            if (error) {
                console.error('Erro ao buscar relatórios:', error);
                throw new Error(error.message);
            }

            if (data) {
                // Obter nomes de usuários separadamente para evitar falhas de RLS em joins diretos
                const userIds = [...new Set(data.flatMap((m: any) => [m.user_id, m.created_by]).filter(Boolean))];
                let usersMap: Record<string, string> = {};
                
                if (userIds.length > 0) {
                    const { data: usersData } = await DataService.getServiceClient()
                        .from('users')
                        .select('id, name')
                        .in('id', userIds);
                        
                    if (usersData) {
                        usersMap = usersData.reduce((acc: any, u: any) => {
                            acc[u.id] = u.name;
                            return acc;
                        }, {});
                    }
                }

                const groups = data.reduce((acc: any, m: any) => {
                    const rawRef = m.reference_id || 'Avulso';
                    const parts = rawRef.split('|');
                    const baseRef = parts[0];
                    
                    // Armazenar os metadados de quantidade temporariamente no objeto para uso nos relatórios
                    m._prevQty = parts[1] || '-';
                    m._currQty = parts[2] || '-';

                    const uId = m.user_id || m.created_by;
                    const executorName = uId && usersMap[uId] ? usersMap[uId] : 'Sistema';
                    if (!acc[baseRef]) acc[baseRef] = { reference_id: baseRef, created_at: m.created_at, items: [], executor: executorName };
                    acc[baseRef].items.push(m);
                    return acc;
                }, {});
                setBalanceReports(Object.values(groups));
            }
        } catch(err: any) {
            console.error(err);
            alert(`Erro ao carregar relatórios: ${err.message}`);
        } finally {
            setLoadingReports(false);
        }
    };

    const openBalanceReports = () => {
        setIsBalanceReportModalOpen(true);
        fetchBalanceReports();
    };

    useEffect(() => {
        if (isBalanceReportModalOpen) {
            fetchBalanceReports();
        }
    }, [reportDateFrom, reportDateTo, isBalanceReportModalOpen]);

    const handlePrintBalanceReport = async (report: any) => {
        const printWindow = window.open('', '_blank');
        if (!printWindow) return;

        const tenant = await DataService.getTenantById(null);
        
        const logoHtml = tenant?.logo_url 
            ? `<img src="${tenant.logo_url}" alt="Logo" style="max-height: 60px; object-fit: contain;" />` 
            : `<h2 style="margin:0; font-size: 24px; color: #1c2d4f;">${tenant?.company_name || tenant?.name || 'Empresa'}</h2>`;
            
        const companyInfoHtml = `
            <div style="font-size: 11px; color: #555; text-align: right; line-height: 1.4;">
                <strong>${tenant?.company_name || tenant?.name || 'Empresa'}</strong><br/>
                CNPJ: ${tenant?.cnpj || 'Não informado'} | Tel: ${tenant?.phone || 'Não informado'}<br/>
                ${tenant?.email || ''} | ${tenant?.website || ''}<br/>
                ${tenant?.street || ''}, ${tenant?.number || ''} - ${tenant?.neighborhood || ''}, ${tenant?.city || ''}
            </div>
        `;

        printWindow.document.write(`
            <html>
                <head>
                    <title>Relatório de Balanço ${report.reference_id}</title>
                    <style>
                        @page { size: landscape; margin: 10mm; }
                        body { font-family: Arial, sans-serif; padding: 20px; color: #333; }
                        .header-container { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #1c2d4f; padding-bottom: 15px; margin-bottom: 20px; }
                        h1 { font-size: 20px; margin: 0; color: #1c2d4f; padding-bottom: 5px; }
                        .meta { font-size: 14px; margin-bottom: 20px; color: #666; }
                        table { border-collapse: collapse; margin-top: 20px; width: 100%; }
                        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 12px; }
                        th { background-color: #f5f5f5; }
                        .diff-pos { color: #10b981; font-weight: bold; }
                        .diff-neg { color: #ef4444; font-weight: bold; }
                    </style>
                </head>
                <body>
                    <div class="header-container">
                        <div>${logoHtml}</div>
                        <div>${companyInfoHtml}</div>
                    </div>
                    <h1>Auditoria de Balanço: ${report.reference_id}</h1>
                    <div class="meta">
                        <p><strong>Data da Aferição:</strong> ${new Date(report.created_at).toLocaleString('pt-BR')}</p>
                        <p><strong>Responsável:</strong> ${report.executor || 'Sistema'}</p>
                        <p><strong>Total de Itens Aferidos (com alteração):</strong> ${report.items.length}</p>
                    </div>
                    <table>
                        <thead>
                            <tr>
                                <th>Cód/SKU</th>
                                <th>Descrição da Peça/Produto</th>
                                <th>Tipo de Ajuste</th>
                                <th style="text-align:center;">Qtd. Anterior</th>
                                <th style="text-align:center;">Ajuste</th>
                                <th style="text-align:center;">Saldo Final</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${report.items.map((m: any) => {
                                return `
                                <tr>
                                    <td>${m.stock_items?.code || '-'}</td>
                                    <td>${m.stock_items?.description || '-'}</td>
                                    <td>${m.type === 'RESTOCK' ? 'Sobra de Estoque (+)' : 'Quebra/Falta (-)'}</td>
                                    <td style="text-align:center;">${m._prevQty || '-'}</td>
                                    <td class="${m.type === 'RESTOCK' ? 'diff-pos' : 'diff-neg'}" style="text-align:center;">
                                        ${m.type === 'RESTOCK' ? '+' : '-'}${m.quantity}
                                    </td>
                                    <td style="text-align:center; font-weight:bold;">${m._currQty || '-'}</td>
                                </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                    <script>window.onload = () => { window.print(); }</script>
                </body>
            </html>
        `);
        printWindow.document.close();
    };

    const handleExportExcelBalance = (report: any) => {
        let csvContent = "data:text/csv;charset=utf-8,\uFEFF";
        csvContent += "Cód/SKU;Descrição da Peça/Produto;Tipo de Ajuste;Qtd. Anterior;Ajuste;Saldo Final;Data;Responsável\n";
        
        const dateStr = new Date(report.created_at).toLocaleString('pt-BR');
        const executor = report.executor || 'Sistema';

        report.items.forEach((m: any) => {
            const code = m.stock_items?.code || '-';
            const desc = (m.stock_items?.description || '-').replace(/;/g, ',');
            const type = m.type === 'RESTOCK' ? 'Sobra de Estoque (+)' : 'Quebra/Falta (-)';
            const qty = m.type === 'RESTOCK' ? `+${m.quantity}` : `-${m.quantity}`;
            csvContent += `${code};${desc};${type};${m._prevQty || '-'};${qty};${m._currQty || '-'};${dateStr};${executor}\n`;
        });
        
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `balanco_${report.reference_id}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // --- Print & Export Stock ---
    const getExportItems = () => {
        if (selectedItems.size > 0) {
            return items.filter(i => selectedItems.has(i.id));
        }
        return items; // all loaded/filtered items
    };

    const handlePrintStock = async () => {
        const exportItems = getExportItems();
        if (exportItems.length === 0) { alert('Nenhum item para imprimir.'); return; }
        const tenant = await DataService.getTenantById(null);
        const logoHtml = tenant?.logo_url
            ? `<img src="${tenant.logo_url}" alt="Logo" style="max-height:50px;object-fit:contain;"/>`
            : `<strong style="font-size:20px;color:#1c2d4f;">${tenant?.company_name || 'Empresa'}</strong>`;
        const now = new Date().toLocaleString('pt-BR');
        const filterInfo = [
            searchTerm ? `Busca: "${searchTerm}"` : '',
            categoryFilter !== 'ALL' ? `Categoria: ${categoryFilter}` : '',
            statusFilter !== 'ALL' ? `Status: ${statusFilter}` : '',
            selectedItems.size > 0 ? `Selecionados: ${selectedItems.size} itens` : `Total: ${exportItems.length} itens`
        ].filter(Boolean).join(' | ');

        const rows = exportItems.map((item, i) => {
            const totalCost = (Number(item.costPrice) || 0) + (Number(item.freightCost) || 0) + ((Number(item.costPrice) || 0) * (Number((item as any).taxPercent) || 0) / 100);
            const margin = totalCost > 0 ? (((Number(item.sellPrice) || 0) - totalCost) / totalCost * 100).toFixed(1) : '-';
            const isLow = Number(item.quantity) <= Number(item.minQuantity || 0);
            return `<tr style="background:${i % 2 === 0 ? '#fff' : '#f8fafc'}">
                <td>${item.code || '-'}</td>
                <td>${item.description}</td>
                <td>${(item as any).category || '-'}</td>
                <td>${(item as any).location || '-'}</td>
                <td style="text-align:center;font-weight:bold;color:${isLow ? '#ef4444' : '#10b981'}">${item.quantity}</td>
                <td style="text-align:right;">R$ ${Number(item.costPrice || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                <td style="text-align:right;">R$ ${Number(item.sellPrice || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                <td style="text-align:center;">${margin !== '-' ? margin + '%' : '-'}</td>
                <td style="text-align:right;">R$ ${(Number(item.quantity) * Number(item.sellPrice || 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
            </tr>`;
        }).join('');

        const totalValue = exportItems.reduce((a, i) => a + (Number(i.quantity) * Number(i.sellPrice || 0)), 0);

        const w = window.open('', '_blank');
        if (!w) return;
        w.document.write(`<!DOCTYPE html><html><head><title>Relatório de Estoque</title>
        <style>
            @page { size: A4 landscape; margin: 12mm; }
            body { font-family: Arial, sans-serif; color: #333; font-size: 11px; }
            .hdr { display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #1c2d4f; padding-bottom:10px; margin-bottom:12px; }
            .meta { font-size:10px; color:#666; margin-bottom:8px; }
            table { width:100%; border-collapse:collapse; }
            th { background:#1c2d4f; color:#fff; padding:6px 8px; font-size:10px; text-align:left; }
            td { padding:5px 8px; border-bottom:1px solid #e2e8f0; font-size:10px; }
            .footer { margin-top:14px; border-top:1px solid #e2e8f0; padding-top:8px; display:flex; justify-content:space-between; font-size:10px; color:#666; }
            .total { font-weight:bold; color:#1c2d4f; }
        </style></head><body>
        <div class="hdr"><div>${logoHtml}</div><div style="text-align:right;"><strong>Relatório de Estoque</strong><br/><span style="font-size:10px;color:#666;">Emitido em: ${now}</span></div></div>
        <div class="meta">${filterInfo}</div>
        <table>
            <thead><tr>
                <th>Código</th><th>Descrição</th><th>Categoria</th><th>Localização</th>
                <th style="text-align:center">Saldo</th>
                <th style="text-align:right">Custo</th>
                <th style="text-align:right">Venda</th>
                <th style="text-align:center">Margem</th>
                <th style="text-align:right">Valor Total</th>
            </tr></thead>
            <tbody>${rows}</tbody>
        </table>
        <div class="footer">
            <span>${exportItems.length} item(ns)</span>
            <span class="total">Valor Total em Estoque: R$ ${totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
        </div>
        <script>window.onload=()=>window.print();</script>
        </body></html>`);
        w.document.close();
    };

    const handleExportExcelStock = () => {
        const exportItems = getExportItems();
        if (exportItems.length === 0) { alert('Nenhum item para exportar.'); return; }
        const now = new Date().toLocaleString('pt-BR');
        let csv = '\uFEFF'; // BOM for Excel UTF-8
        csv += `Código;Cód. Externo;Descrição;Categoria;Localização;Saldo;Mínimo;Custo (R$);Venda (R$);Margem (%);Valor Total (R$);Status;Exportado em\n`;
        exportItems.forEach(item => {
            const totalCost = (Number(item.costPrice) || 0) + (Number(item.freightCost) || 0) + ((Number(item.costPrice) || 0) * (Number((item as any).taxPercent) || 0) / 100);
            const margin = totalCost > 0 ? (((Number(item.sellPrice) || 0) - totalCost) / totalCost * 100).toFixed(2) : '0';
            const totalVal = (Number(item.quantity) * Number(item.sellPrice || 0)).toFixed(2);
            const status = Number(item.quantity) <= Number(item.minQuantity || 0) ? 'Crítico' : (item.active !== false ? 'Normal' : 'Inativo');
            csv += [
                item.code || '',
                (item as any).externalCode || '',
                `"${(item.description || '').replace(/"/g, '""')}"`,
                (item as any).category || '',
                (item as any).location || '',
                item.quantity,
                item.minQuantity || 0,
                (Number(item.costPrice || 0).toFixed(2)).replace('.', ','),
                (Number(item.sellPrice || 0).toFixed(2)).replace('.', ','),
                margin.replace('.', ','),
                totalVal.replace('.', ','),
                status,
                `"${now}"`
            ].join(';') + '\n';
        });
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `estoque_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

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
            const data = await DataService.getMovements({
                type: movTypeFilter,
                dateFrom: movDateFrom,
                dateTo: movDateTo
            });
            setMovements(data);
        } catch (err: any) {
            console.error('Erro ao carregar movimentações:', err);
        }
    };

    const loadItemMovements = async (itemId: string) => {
        try {
            const data = await DataService.getMovements({ stockItemId: itemId });
            setItemMovements(data);
        } catch (err) {
            console.error('Erro ao carregar histórico do item:', err);
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
    useEffect(() => {
        if (activeTab === 'movements') {
            loadMovements();
        }
    }, [movTypeFilter, movDateFrom, movDateTo, activeTab]);

    useEffect(() => {
        if (activeTab === 'balance') {
            setStagedBalances({}); // Clear inputs when entering tab
        }
    }, [activeTab, currentPage, searchTerm, categoryFilter]);

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
                code: '', externalCode: '', description: '', category: '', location: '',
                quantity: '', minQuantity: '', costPrice: '', sellPrice: '', freightCost: '',
                taxPercent: '', unit: 'UN', active: true
            });
            setItemMovements([]);
        }
        setModalTab('dados');
        setIsModalOpen(true);
        if (item) loadItemMovements(item.id);
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setImageUploading(true);
        try {
            const prefix = formData.code ? `items/${formData.code}` : `items/temp_${Date.now()}`;
            const path = `inventory/${prefix}/${file.name}`;
            const url = await StorageService.uploadBlob(file, path);
            setFormData((prev: any) => ({ ...prev, imageUrl: url }));
        } catch (error) {
            alert('Erro ao enviar imagem. Verifique a conexão com o Supabase.');
            console.error(error);
        } finally {
            setImageUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const generateCode = () => {
        setFormData({ ...formData, code: 'NX' + Math.floor(Math.random() * 1000000).toString().padStart(6, '0') });
    };

    const handlePrintQR = () => {
        if (!formData.code) return;
        setPrintModalOpen(true);
    };

    const executePrintQR = () => {
        if (!formData.code) return;
        const printWindow = window.open('', '_blank');
        if (!printWindow) return;
        
        const itemName = (formData.description || 'Produto Nexus').replace(/['"]/g, '');
        const qty = printConfig.quantity || 1;
        const companyName = printConfig.companyName || 'NEXUS PRO';

        let htmlContent = '';
        
        if (printConfig.type === 'a4_maxprint_33') {
            htmlContent = `
            <!DOCTYPE html>
            <html>
                <head>
                    <title>Etiquetas - ${formData.code}</title>
                    <style>
                        @page { margin: 12.7mm 4mm; size: A4; }
                        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; margin: 0; padding: 0; background: #fff; }
                        .page { display: grid; grid-template-columns: repeat(3, 1fr); grid-auto-rows: 25.4mm; gap: 0; width: 210mm; margin: 0 auto; page-break-after: always; }
                        .label { box-sizing: border-box; width: 66.7mm; height: 25.4mm; padding: 2mm 3mm; display: flex; align-items: center; justify-content: flex-start; border: 1px dashed transparent; }
                        .qr { width: 21mm; height: 21mm; margin-right: 3mm; object-fit: contain; }
                        .info { display: flex; flex-direction: column; justify-content: center; overflow: hidden; flex: 1; }
                        .company { font-size: 7px; font-weight: bold; text-transform: uppercase; color: #555; margin-top: 2px; }
                        .sku { font-size: 11px; font-weight: 900; margin: 1px 0; color: #000; }
                        .desc { font-size: 8px; line-height: 1.2; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; color: #333; }
                    </style>
                </head>
                <body>
                    <div class="page">
                        ${Array.from({length: qty}).map(() => `
                        <div class="label">
                            <img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(formData.code)}" class="qr" />
                            <div class="info">
                                <span class="sku">${formData.code}</span>
                                <span class="desc">${itemName}</span>
                                <span class="company">${companyName}</span>
                            </div>
                        </div>
                        `).join('')}
                    </div>
                    <script>window.onload = () => { setTimeout(() => { window.print(); window.close(); }, 500); }</script>
                </body>
            </html>`;
        } else {
            htmlContent = `
            <!DOCTYPE html>
            <html>
                <head>
                    <title>Etiquetas - ${formData.code}</title>
                    <style>
                        @page { margin: 0; size: 40mm 40mm; }
                        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; margin: 0; padding: 0; background: #fff; width: 40mm; }
                        .label { width: 40mm; height: 40mm; box-sizing: border-box; padding: 2mm; display: flex; flex-direction: column; align-items: center; justify-content: center; page-break-after: always; text-align: center; }
                        .qr { width: 24mm; height: 24mm; margin-bottom: 1.5mm; }
                        .sku { font-size: 11px; font-weight: 900; line-height: 1; margin-bottom: 2px; }
                        .company { font-size: 7px; font-weight: bold; text-transform: uppercase; color: #555; }
                    </style>
                </head>
                <body>
                    ${Array.from({length: qty}).map(() => `
                    <div class="label">
                        <span class="sku">${formData.code}</span>
                        <img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(formData.code)}" class="qr" />
                        <span class="company">${companyName}</span>
                    </div>
                    `).join('')}
                    <script>window.onload = () => { setTimeout(() => { window.print(); window.close(); }, 500); }</script>
                </body>
            </html>`;
        }
        printWindow.document.write(htmlContent);
        printWindow.document.close();
        setPrintModalOpen(false);
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
        if (activeTab !== 'items' && activeTab !== 'balance') return;

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
        <div className="p-4 pr-8 font-poppins">
            <div className="mb-2 sm:mb-4 p-2 sm:p-3 rounded-2xl border border-[#1c2d4f]/20 bg-white/40 shadow-sm backdrop-blur-md flex flex-col gap-3">
                <div className="w-full overflow-x-auto custom-scrollbar pb-1 mb-1">
                    <div className="flex items-center gap-1 w-max">
                        <div className="flex bg-white/60 p-0.5 sm:p-1 rounded-xl border border-[#1c2d4f]/10 shadow-sm">
                            <button onClick={() => setActiveTab('items')} className={`px-2 sm:px-3 h-8 rounded-lg text-[9px] font-bold transition-all flex items-center gap-1 ${activeTab === 'items' ? 'bg-[#1c2d4f] text-white shadow-md' : 'text-slate-500 hover:text-[#1c2d4f] hover:bg-white'}`}>
                                <List size={14} /> <span className="whitespace-nowrap">Estoque</span>
                            </button>
                            <button onClick={() => setActiveTab('categories')} className={`px-2 sm:px-3 h-8 rounded-lg text-[9px] font-bold transition-all flex items-center gap-1 ${activeTab === 'categories' ? 'bg-[#1c2d4f] text-white shadow-md' : 'text-slate-500 hover:text-[#1c2d4f] hover:bg-white'}`}>
                                <Tag size={14} /> <span className="whitespace-nowrap">Categorias</span>
                            </button>
                            <button onClick={() => setActiveTab('techs')} className={`px-2 sm:px-3 h-8 rounded-lg text-[9px] font-bold transition-all flex items-center gap-1 ${activeTab === 'techs' ? 'bg-[#1c2d4f] text-white shadow-md' : 'text-slate-500 hover:text-[#1c2d4f] hover:bg-white'}`}>
                                <Box size={14} /> <span className="whitespace-nowrap">Técnicos</span>
                            </button>
                            <button onClick={() => setActiveTab('movements')} className={`px-2 sm:px-3 h-8 rounded-lg text-[9px] font-bold transition-all flex items-center gap-1 ${activeTab === 'movements' ? 'bg-[#1c2d4f] text-white shadow-md' : 'text-slate-500 hover:text-[#1c2d4f] hover:bg-white'}`}>
                                <Scale size={14} /> <span className="whitespace-nowrap">Auditoria</span>
                            </button>
                            <button onClick={() => setActiveTab('balance')} className={`px-2 sm:px-3 h-8 rounded-lg text-[9px] font-bold transition-all flex items-center gap-1 ${activeTab === 'balance' ? 'bg-[#1c2d4f] text-white shadow-md' : 'text-slate-500 hover:text-[#1c2d4f] hover:bg-white'}`}>
                                <ClipboardCheck size={14} /> <span className="whitespace-nowrap">Balanço</span>
                            </button>
                        </div>
                    </div>
                </div>

                <div className="flex flex-wrap lg:flex-nowrap items-center justify-between gap-2 sm:gap-3">

                    {(activeTab === 'items' || activeTab === 'balance') && (
                        <div className="relative flex-1 min-w-[200px] w-full lg:w-auto">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                            <input
                                type="text"
                                placeholder={activeTab === 'balance' ? "Digite ou bipe o cód. da peça / nome..." : "Localizar no estoque..."}
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="w-full h-10 bg-white border border-[#1c2d4f]/20 rounded-xl pl-9 pr-4 text-xs font-bold text-slate-700 placeholder-slate-400 outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all shadow-sm"
                            />
                        </div>
                    )}

                    <div className="flex items-center gap-2 w-full lg:w-auto justify-end shrink-0">
                        {(activeTab === 'items' || activeTab === 'balance') && (
                            <div className="hidden sm:flex items-center bg-white border border-[#1c2d4f]/20 rounded-xl pl-2 pr-1 h-10 shadow-sm max-w-[160px]">
                                <Filter size={12} className="text-slate-400 mr-2 shrink-0" />
                                <select 
                                    value={categoryFilter} 
                                    onChange={e => setCategoryFilter(e.target.value)} 
                                    className="bg-transparent text-[10px] font-bold text-slate-600 outline-none w-full cursor-pointer h-full truncate"
                                >
                                    <option value="ALL">Todas Categorias</option>
                                    {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                                </select>
                            </div>
                        )}

                        {activeTab === 'items' && (
                            <Button
                                onClick={() => setIsRestockModalOpen(true)}
                                className="h-10 px-3 bg-[#1c2d4f] hover:bg-[#253a66] border-[#1c2d4f] text-white text-[10px] font-bold shadow-lg shadow-[#1c2d4f]/20 flex items-center gap-1.5 transition-all rounded-xl"
                            >
                                <Scale size={14} /> Entrada
                            </Button>
                        )}

                        {(activeTab === 'items' || activeTab === 'categories') && (
                            <Button
                                onClick={() => activeTab === 'items' ? handleOpenModal() : handleOpenCategoryModal()}
                                className="h-10 px-4 bg-[#10b981] hover:bg-[#059669] border-[#10b981] text-white text-[11px] font-bold shadow-lg shadow-[#10b981]/20 flex items-center gap-1.5 whitespace-nowrap transition-all rounded-xl"
                            >
                                <Plus size={14} /> {activeTab === 'items' ? 'Novo Cadastro' : 'Nova Categoria'}
                            </Button>
                        )}

                        {activeTab === 'items' && (
                            <>
                                <button
                                    onClick={handleExportExcelStock}
                                    title="Exportar para Excel / CSV"
                                    className="h-10 px-3 bg-white border border-emerald-200 text-emerald-600 hover:bg-emerald-50 text-[10px] font-bold flex items-center gap-1.5 rounded-xl transition-all shadow-sm whitespace-nowrap"
                                >
                                    <FileText size={14} /> Excel
                                    {selectedItems.size > 0 && <span className="ml-1 bg-emerald-100 text-emerald-700 text-[9px] font-black px-1.5 py-0.5 rounded-full">{selectedItems.size}</span>}
                                </button>
                                <button
                                    onClick={handlePrintStock}
                                    title="Imprimir relatório PDF paisagem"
                                    className="h-10 px-3 bg-white border border-[#1c2d4f]/20 text-[#1c2d4f] hover:bg-slate-50 text-[10px] font-bold flex items-center gap-1.5 rounded-xl transition-all shadow-sm whitespace-nowrap"
                                >
                                    <Printer size={14} /> PDF
                                    {selectedItems.size > 0 && <span className="ml-1 bg-[#1c2d4f]/10 text-[#1c2d4f] text-[9px] font-black px-1.5 py-0.5 rounded-full">{selectedItems.size}</span>}
                                </button>
                            </>
                        )}

                        {activeTab === 'items' && items.length > 0 && (
                            <button
                                onClick={() => {
                                    if (selectedItems.size === items.length) {
                                        setSelectedItems(new Set());
                                    } else {
                                        setSelectedItems(new Set(items.map(i => i.id)));
                                    }
                                }}
                                className={`h-10 px-3 border text-[10px] font-bold flex items-center gap-1.5 rounded-xl transition-all shadow-sm whitespace-nowrap ${
                                    selectedItems.size === items.length
                                        ? 'bg-[#1c2d4f] text-white border-[#1c2d4f]'
                                        : 'bg-white border-slate-200 text-slate-500 hover:border-[#1c2d4f]/40'
                                }`}
                            >
                                {selectedItems.size === items.length ? 'Desmarcar' : 'Selecionar Todos'}
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Main Table Container */}
            <div className="bg-white border border-slate-300/80 rounded-xl shadow-lg shadow-slate-200/50 flex flex-col flex-1 ring-1 ring-slate-200/80">
                {activeTab === 'items' ? (
                    <>
                        <div className="flex-1 overflow-auto custom-scrollbar">
                            <table className="w-full border-collapse">
                                <thead className="sticky top-0 bg-slate-200/60 backdrop-blur-md border-b border-slate-300 z-10 shadow-sm">
                                    <tr className="text-[12px] font-semibold text-slate-600 tracking-tight text-center">
                                        <th className="px-3 py-2 w-10 first:pl-4">
                                            <input type="checkbox"
                                                className="w-3.5 h-3.5 rounded border-slate-300 accent-[#1c2d4f] cursor-pointer"
                                                checked={selectedItems.size === items.length && items.length > 0}
                                                onChange={() => {
                                                    if (selectedItems.size === items.length) setSelectedItems(new Set());
                                                    else setSelectedItems(new Set(items.map(i => i.id)));
                                                }}
                                            />
                                        </th>
                                        <th className="px-3 py-2">Identificação / SKU</th>
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
                                            <td colSpan={9} className="py-20 text-center px-6">
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
                                            <td colSpan={9} className="py-20 text-center">
                                                <RefreshCw size={40} className="mx-auto text-primary-600 animate-spin mb-4" />
                                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sincronizando Estoque...</p>
                                            </td>
                                        </tr>
                                    ) :
                                        items.length === 0 ? (
                                            <tr>
                                                <td colSpan={9} className="py-20 text-center">
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
                                                        className={`transition-all border-b border-slate-100 group bg-white ${selectedItems.has(item.id) ? 'bg-emerald-50/50 hover:bg-emerald-50' : 'hover:bg-slate-50'}`}
                                                    >
                                                        <td className="px-3 py-3 pl-4" onClick={(e) => e.stopPropagation()}>
                                                            <input type="checkbox"
                                                                className="w-3.5 h-3.5 rounded border-slate-300 accent-[#1c2d4f] cursor-pointer"
                                                                checked={selectedItems.has(item.id)}
                                                                onChange={() => {
                                                                    const next = new Set(selectedItems);
                                                                    if (next.has(item.id)) next.delete(item.id);
                                                                    else next.add(item.id);
                                                                    setSelectedItems(next);
                                                                }}
                                                            />
                                                        </td>
                                                        <td className="px-3 py-3 cursor-pointer" onClick={() => handleOpenModal(item)}>
                                                            <div className="flex flex-col truncate max-w-[100px]">
                                                                <span className="text-[12px] font-medium text-primary-600 truncate">{item?.code || '---'}</span>
                                                                {item?.externalCode && (
                                                                    <span className="text-[10px] text-slate-400 flex items-center gap-1 truncate font-normal">
                                                                        <Barcode size={10} className="shrink-0" /> {item.externalCode}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className="px-3 py-3 cursor-pointer" onClick={() => handleOpenModal(item)}>
                                                            <p className="text-[12px] font-medium text-slate-700 truncate max-w-[220px]">{item?.description || 'Item sem descrição'}</p>
                                                            <div className="flex gap-1.5 overflow-hidden">
                                                                <span className="text-[10px] text-slate-400 truncate">{item?.category || '-'}</span>
                                                                <span className="text-[10px] text-slate-300 shrink-0">•</span>
                                                                <span className="text-[10px] text-slate-400 shrink-0">{item?.unit || 'UN'}</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-3 py-3 text-[11px] text-slate-500 truncate max-w-[100px] cursor-pointer" onClick={() => handleOpenModal(item)}>{item?.location || '-'}</td>
                                                        <td className="px-3 py-3 text-center cursor-pointer" onClick={() => handleOpenModal(item)}>
                                                            <div className="flex items-center justify-center gap-1.5">
                                                                <span className={`text-[12px] font-semibold tracking-tight ${(item?.quantity || 0) <= (item?.minQuantity || 0) ? 'text-rose-500' : 'text-slate-700'}`}>{item?.quantity || 0}</span>
                                                                {(item?.quantity || 0) <= (item?.minQuantity || 0) && <AlertTriangle size={12} className="text-rose-500 shrink-0" />}
                                                            </div>
                                                        </td>
                                                        <td className="px-3 py-3 text-[11px] text-slate-500 text-right whitespace-nowrap cursor-pointer" onClick={() => handleOpenModal(item)}>R$ {totalCost.toFixed(2)}</td>
                                                        <td className="px-3 py-3 text-[11px] text-slate-700 text-right whitespace-nowrap font-medium cursor-pointer" onClick={() => handleOpenModal(item)}>R$ {(item?.sellPrice || 0).toFixed(2)}</td>
                                                        <td className="px-3 py-3 cursor-pointer" onClick={() => handleOpenModal(item)}>
                                                            <div className={`flex items-center justify-center gap-1 text-[11px] font-bold ${margin >= 30 ? 'text-emerald-500' : (margin > 0 ? 'text-amber-500' : 'text-rose-500')}`}>
                                                                {margin >= 0 ? <TrendingUp size={12} className="shrink-0" /> : <TrendingDown size={12} className="shrink-0" />}
                                                                {margin.toFixed(1)}%
                                                            </div>
                                                        </td>
                                                        <td className="px-3 py-3 text-right pr-6">
                                                            <div className="flex items-center justify-end gap-1 transition-all">
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
                    <div className="p-4 sm:p-10 shrink-0">
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
                                        <Layers size={16} /> Movimentação de Itens
                                    </Button>
                                </div>

                                <div className="flex flex-col gap-6">
                                    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm relative z-20">
                                        <div className="flex flex-col sm:flex-row gap-4 items-end">
                                            <div className="flex-1 w-full space-y-1.5 relative">
                                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">Localizar Técnico</label>
                                                <div className="relative">
                                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                                    <input
                                                        type="text"
                                                        placeholder="Digite o nome do técnico..."
                                                        value={techSearch}
                                                        onChange={e => {
                                                            setTechSearch(e.target.value);
                                                            if (!e.target.value) setSelectedTech(null);
                                                        }}
                                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-3 text-sm font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-primary-100 transition-all"
                                                    />
                                                    
                                                    {techSearch && !selectedTech && (
                                                        <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-lg max-h-60 overflow-y-auto custom-scrollbar">
                                                            {techs
                                                                .filter(t => t.name.toLowerCase().includes(techSearch.toLowerCase()))
                                                                .map(t => (
                                                                    <button
                                                                        key={t.id}
                                                                        onClick={async () => {
                                                                            setSelectedTech(t);
                                                                            setTechSearch(t.name);
                                                                            setTechStockSearch('');
                                                                            const stock = await DataService.getTechStock(t.id);
                                                                            setTechStock(stock);
                                                                        }}
                                                                        className="w-full flex items-center gap-3 p-3 hover:bg-slate-50 border-b border-slate-100 last:border-0 transition-all text-left"
                                                                    >
                                                                        <div className="w-8 h-8 rounded-full bg-primary-50 text-primary-600 flex items-center justify-center text-xs font-bold shrink-0">
                                                                            {t.name.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase()}
                                                                        </div>
                                                                        <div>
                                                                            <p className="text-xs font-bold text-slate-800 uppercase tracking-tight">{t.name}</p>
                                                                            <p className="text-[10px] font-medium text-slate-400 uppercase tracking-widest">{t.role === 'ADMIN' ? 'GESTÃO' : 'OPERACIONAL'}</p>
                                                                        </div>
                                                                    </button>
                                                                ))}
                                                            {techs.filter(t => t.name.toLowerCase().includes(techSearch.toLowerCase())).length === 0 && (
                                                                <div className="p-4 text-center text-slate-400 text-xs font-medium">Nenhum técnico encontrado.</div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Inventário do Técnico */}
                                    <div className="w-full space-y-6 flex flex-col">
                                        {selectedTech ? (
                                            <>
                                                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between bg-white border border-slate-200 rounded-xl p-4 shadow-sm shrink-0 gap-4 mt-2">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-10 h-10 bg-[#1c2d4f] rounded-xl flex items-center justify-center border border-primary-900/20 shadow-inner">
                                                            <Box size={20} className="text-white" />
                                                        </div>
                                                        <div>
                                                            <h4 className="text-base font-black text-slate-800 uppercase tracking-tight leading-none">{selectedTech.name}</h4>
                                                            <p className="text-[10px] font-bold uppercase text-slate-400 mt-1 tracking-widest">Cautela de Carga Ativa</p>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-4">
                                                        <div className="relative">
                                                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                                            <input
                                                                type="text"
                                                                placeholder="Filtrar por nome ou SKU..."
                                                                value={techStockSearch}
                                                                onChange={e => setTechStockSearch(e.target.value)}
                                                                className="w-full sm:w-64 pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-primary-100"
                                                            />
                                                        </div>
                                                        <div className="text-right flex items-center gap-3 bg-slate-50 border border-slate-100 px-4 py-2 rounded-lg">
                                                            <div className="flex flex-col items-end sm:flex-row sm:items-center gap-3">
                                                                <div className="flex items-center gap-2">
                                                                    <p className="text-[10px] font-bold uppercase text-slate-400 hidden sm:block">Itens Custodiados</p>
                                                                    <div className="bg-white text-slate-700 font-black text-sm px-3 py-1 rounded shadow-sm">{techStock.length}</div>
                                                                </div>
                                                                <div className="w-px h-6 bg-slate-200 hidden sm:block"></div>
                                                                <div className="flex items-center gap-2">
                                                                    <p className="text-[10px] font-bold uppercase text-slate-400 hidden sm:block">Volume Total Carga</p>
                                                                    <div className="bg-[#1c2d4f] text-white font-black text-sm px-3 py-1 rounded shadow-sm relative overflow-hidden group">
                                                                        <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform"></div>
                                                                        <span className="relative z-10">{techStock.reduce((acc, curr) => acc + (Number(curr.quantity) || 0), 0)}</span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
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
                                                                ) : techStock
                                                                    .filter(ts => ts.item?.code?.toLowerCase().includes(techStockSearch.toLowerCase()) || ts.item?.description?.toLowerCase().includes(techStockSearch.toLowerCase()))
                                                                    .map(ts => (
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
                                                <tr className="text-[10px] font-semibold text-slate-600 tracking-tight text-center uppercase">
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
                        
                        {activeTab === 'balance' && (
                            <div className="space-y-6 animate-fade-in font-poppins flex flex-col h-full">
                                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0 px-4 sm:px-10 pt-4 sm:pt-10">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-[#1c2d4f] rounded-xl flex items-center justify-center text-white border border-primary-900/20 shadow-sm">
                                            <ClipboardCheck size={20} />
                                        </div>
                                        <div>
                                            <h3 className="text-xl font-black text-slate-800 uppercase leading-none">
                                                Balanço de Estoque
                                            </h3>
                                            <p className="text-[10px] text-slate-400 font-medium mt-1 uppercase tracking-wider">Aferição física e auditoria de saldos</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <Button
                                            onClick={openBalanceReports}
                                            variant="secondary"
                                            className="h-9 px-4 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs font-bold shadow-sm transition-all flex items-center gap-2 hover:bg-slate-50 hover:text-slate-900"
                                        >
                                            <FileText size={14} /> Relatórios
                                        </Button>
                                    </div>
                                </div>
                                
                                <div className="flex-1 min-h-0 flex flex-col bg-white border-t border-slate-200 mt-2 rounded-b-2xl">
                                    <div className="overflow-auto custom-scrollbar flex-1">
                                        <table className="w-full text-left border-collapse min-w-[700px]">
                                            <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 z-10">
                                                <tr className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-none">
                                                    <th className="px-6 py-4">Item / Produto</th>
                                                    <th className="px-6 py-4 text-center">Saldo Sistema</th>
                                                    <th className="px-6 py-4 text-center">Saldo Físico (Real)</th>
                                                    <th className="px-6 py-4 text-center">Diferença</th>
                                                    <th className="px-6 py-4 text-right">Ação</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {loading ? (
                                                    <tr>
                                                        <td colSpan={5} className="py-20 text-center">
                                                            <RefreshCw size={30} className="mx-auto text-primary-600 animate-spin mb-3" />
                                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Carregando Itens...</p>
                                                        </td>
                                                    </tr>
                                                ) : items.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={5} className="py-20 text-center">
                                                            <div className="w-16 h-16 bg-slate-50 rounded-[2rem] flex items-center justify-center mx-auto mb-4 border border-slate-100">
                                                                <Package size={24} className="text-slate-300" />
                                                            </div>
                                                            <p className="text-[10px] font-black tracking-widest uppercase text-slate-400">Nenhum item localizado</p>
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    items.map(item => {
                                                        const currentQty = item.quantity || 0;
                                                        const staged = stagedBalances[item.id];
                                                        const realQty = staged ? staged.newQty : null;
                                                        const diff = realQty !== null ? realQty - currentQty : 0;
                                                        const isChanged = realQty !== null && diff !== 0;
                                                        
                                                        return (
                                                            <tr key={item.id} className="hover:bg-slate-50/50 transition-colors group">
                                                                <td className="px-6 py-4">
                                                                    <div className="flex flex-col">
                                                                        <span className="text-[12px] font-bold text-slate-800 uppercase tracking-tight">{item.description}</span>
                                                                        <span className="text-[10px] font-medium text-slate-400 mt-0.5 uppercase tracking-wider flex items-center gap-1">
                                                                            <Barcode size={10} /> {item.code} {item.externalCode && `• ${item.externalCode}`}
                                                                        </span>
                                                                    </div>
                                                                </td>
                                                                <td className="px-6 py-4 text-center">
                                                                    <span className="inline-flex items-center justify-center h-8 px-4 bg-slate-100 text-slate-700 rounded-lg text-[12px] font-black">
                                                                        {currentQty} {item.unit}
                                                                    </span>
                                                                </td>
                                                                <td className="px-6 py-4 text-center">
                                                                    <div className="flex justify-center">
                                                                        <input
                                                                            type="number"
                                                                            placeholder={String(currentQty)}
                                                                            value={realQty !== null ? realQty : ''}
                                                                            onChange={e => {
                                                                                const val = e.target.value;
                                                                                if (val === '') {
                                                                                    const next = {...stagedBalances};
                                                                                    delete next[item.id];
                                                                                    setStagedBalances(next);
                                                                                } else {
                                                                                    setStagedBalances({...stagedBalances, [item.id]: { newQty: Number(val), item }});
                                                                                }
                                                                            }}
                                                                            className="w-24 h-9 text-center bg-white border border-slate-300 rounded-lg text-sm font-black text-[#1c2d4f] outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100 transition-all shadow-inner"
                                                                        />
                                                                    </div>
                                                                </td>
                                                                <td className="px-6 py-4 text-center">
                                                                    {realQty !== null ? (
                                                                        <span className={`inline-flex items-center justify-center h-7 px-3 rounded-lg text-[11px] font-black tracking-widest ${diff > 0 ? 'bg-emerald-50 text-emerald-600' : diff < 0 ? 'bg-rose-50 text-rose-600' : 'bg-slate-50 text-slate-500'}`}>
                                                                            {diff > 0 ? '+' : ''}{diff}
                                                                        </span>
                                                                    ) : (
                                                                        <span className="text-[10px] text-slate-300 font-bold">-</span>
                                                                    )}
                                                                </td>
                                                                <td className="px-6 py-4 text-right">
                                                                    <div className="flex items-center justify-end gap-2">
                                                                        {isChanged && (
                                                                            <span className="text-[9px] font-black text-amber-500 uppercase tracking-widest bg-amber-50 px-2 py-1 rounded">Modificado</span>
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
                                    
                                    {!loading && totalPages > 1 && (
                                        <div className="p-4 border-t border-slate-100 shrink-0">
                                            <Pagination
                                                currentPage={currentPage}
                                                totalPages={totalPages}
                                                totalItems={totalItemsCount}
                                                itemsPerPage={ITEMS_PER_PAGE}
                                                onPageChange={setCurrentPage}
                                            />
                                        </div>
                                    )}

                                    {/* Batch Save Action Bar */}
                                    {Object.keys(stagedBalances).length > 0 && (
                                        <div className="bg-slate-50 border-t border-slate-200 p-4 shrink-0 flex items-center justify-between shadow-[0_-4px_6px_-1px_rgb(0,0,0,0.05)] rounded-b-2xl relative z-20">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 font-black text-sm">
                                                    {Object.keys(stagedBalances).length}
                                                </div>
                                                <div>
                                                    <p className="text-xs font-bold text-slate-800">Itens modificados aguardando confirmação</p>
                                                    <p className="text-[10px] font-medium text-slate-500 uppercase">Lote atualizado será salvo como uma única auditoria.</p>
                                                </div>
                                            </div>
                                            <div className="flex gap-3">
                                                <Button onClick={() => setStagedBalances({})} variant="ghost" className="text-slate-500 text-xs">
                                                    Cancelar Tudo
                                                </Button>
                                                <Button onClick={handleBatchBalanceSave} className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-500/20 text-xs font-bold px-6 py-2 rounded-xl flex items-center gap-2">
                                                    <Save size={16} /> Gravar Balanço ({Object.keys(stagedBalances).length})
                                                </Button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* BALANCE REPORTS MODAL */}
            {isBalanceReportModalOpen && (
                <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in">
                    <div className="bg-white rounded-xl w-full max-w-4xl h-full lg:h-auto lg:max-h-[85vh] shadow-2xl flex flex-col overflow-hidden border border-slate-200">
                        <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-white shrink-0 flex-wrap gap-4">
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-center text-slate-400">
                                    <FileText size={20} />
                                </div>
                                <div>
                                    <h2 className="text-base font-semibold text-slate-900 font-poppins">Relatórios de Auditoria de Balanço</h2>
                                    <p className="text-xs text-slate-500 font-medium mt-0.5">Histórico completo de contagens físicas</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-2 py-1">
                                    <input 
                                        type="date" 
                                        value={reportDateFrom} 
                                        onChange={e => setReportDateFrom(e.target.value)} 
                                        className="bg-transparent text-[10px] font-bold text-slate-600 outline-none h-[28px]" 
                                    />
                                    <span className="text-[9px] font-black text-slate-400">ATÉ</span>
                                    <input 
                                        type="date" 
                                        value={reportDateTo} 
                                        onChange={e => setReportDateTo(e.target.value)} 
                                        className="bg-transparent text-[10px] font-bold text-slate-600 outline-none h-[28px]" 
                                    />
                                    {(reportDateFrom || reportDateTo) && (
                                        <button onClick={() => { setReportDateFrom(''); setReportDateTo(''); }} className="px-2 text-[9px] font-bold uppercase text-rose-400 hover:text-rose-600">Limpar</button>
                                    )}
                                </div>
                                <Button variant="ghost" onClick={() => setIsBalanceReportModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-900">
                                    <X size={20} />
                                </Button>
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50 custom-scrollbar">
                            {loadingReports ? (
                                <div className="py-20 text-center">
                                    <Loader2 size={30} className="mx-auto text-primary-600 animate-spin mb-3" />
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Buscando Relatórios...</p>
                                </div>
                            ) : balanceReports.length === 0 ? (
                                <div className="py-20 text-center bg-white border border-slate-200 rounded-2xl shadow-sm">
                                    <History size={40} className="mx-auto text-slate-300 mb-4" />
                                    <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">Nenhuma auditoria encontrada</p>
                                </div>
                            ) : (
                                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="bg-slate-50 border-b border-slate-200">
                                                <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Referência</th>
                                                <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Data/Hora</th>
                                                <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Itens</th>
                                                <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Responsável</th>
                                                <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Ações</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {balanceReports.map((report: any, idx: number) => (
                                                <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                                                    <td className="px-4 py-4 whitespace-nowrap">
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
                                                                <ClipboardCheck size={14} />
                                                            </div>
                                                            <span className="text-xs font-bold text-slate-700">{report.reference_id}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-4 whitespace-nowrap">
                                                        <div className="flex flex-col">
                                                            <span className="text-xs font-bold text-slate-800">{new Date(report.created_at).toLocaleDateString('pt-BR')}</span>
                                                            <span className="text-[10px] text-slate-500">às {new Date(report.created_at).toLocaleTimeString('pt-BR')}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-4 text-center whitespace-nowrap">
                                                        <span className="inline-flex items-center justify-center px-2 py-1 rounded-full bg-slate-100 text-[10px] font-bold text-slate-600 min-w-[24px]">
                                                            {report.items.length}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-4 whitespace-nowrap">
                                                        <span className="text-xs font-medium text-slate-600">{report.executor || 'Sistema'}</span>
                                                    </td>
                                                    <td className="px-4 py-4 text-right whitespace-nowrap">
                                                        <div className="flex justify-end gap-2">
                                                            <button
                                                                onClick={() => handlePrintBalanceReport(report)}
                                                                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10px] uppercase rounded-lg transition-colors flex items-center gap-1.5"
                                                            >
                                                                <Printer size={12} /> PDF
                                                            </button>
                                                            <button
                                                                onClick={() => handleExportExcelBalance(report)}
                                                                className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-bold text-[10px] uppercase rounded-lg transition-colors flex items-center gap-1.5"
                                                            >
                                                                <FileText size={12} /> Excel
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* RESTOCK MODAL */}
            {isRestockModalOpen && (
                <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-0 lg:p-4 animate-in fade-in">
                    <div className="bg-white rounded-none lg:rounded-xl w-full max-w-lg h-full lg:h-auto shadow-2xl overflow-hidden border-0 lg:border border-slate-200 flex flex-col">
                        <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-slate-100 flex justify-between items-center shrink-0 bg-white">
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-lg flex items-center justify-center border bg-slate-50 border-slate-200 text-[#1c2d4f] shrink-0">
                                    <Package size={18} />
                                </div>
                                <h2 className="text-sm font-semibold text-slate-900 font-poppins">Entrada Rápida de Estoque</h2>
                            </div>
                            <button onClick={() => setIsRestockModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-900 transition-all">
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
                <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in">
                    <div className="bg-white rounded-none lg:rounded-xl w-full max-w-5xl h-full lg:h-auto lg:max-h-[92vh] shadow-2xl flex flex-col overflow-hidden border-0 lg:border border-slate-200">
                        {/* HEADER (Estilo Atividades/OS) */}
                        <div className="px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between bg-white shrink-0 gap-4">
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
                                                {(editingItem.quantity || 0) > (editingItem.minQuantity || 0) ? 'Estoque Regular' : 'Baixo Estoque'}
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                                        {formData.description || 'Gestão de Inventário e Patrimônio • Nexus Pro'}
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center gap-4 sm:gap-2">
                                <Button
                                    onClick={handleSubmit}
                                    form="stock-item-form"
                                    variant="primary"
                                    className="h-9 px-5 bg-[#1c2d4f] hover:bg-[#253a66] text-white text-xs font-bold rounded-lg shadow-md shadow-primary-500/20 transition-all flex items-center gap-2 w-full sm:w-auto justify-center"
                                >
                                    <Save size={14} /> Salvar
                                </Button>
                                <div className="hidden sm:block h-6 w-px bg-slate-200 mx-2"></div>
                                <Button variant="ghost" onClick={() => setIsModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-900 transition-all absolute top-4 right-4 sm:relative sm:top-0 sm:right-0">
                                    <X size={20} />
                                </Button>
                            </div>
                        </div>

                        {/* BODY WRAPPER */}
                        <div className="flex flex-col md:flex-row flex-1 overflow-hidden bg-white">
                            
                            {/* SIDEBAR TABS (desktop) */}
                            <div className="hidden md:flex flex-col w-56 border-r border-slate-200 bg-slate-50/80 p-4 gap-1 overflow-y-auto custom-scrollbar shrink-0">
                                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 px-2">Navegação</div>
                                {[
                                    { id: 'dados', label: 'Dados Gerais', icon: LayoutDashboard },
                                    { id: 'financial', label: 'Financeiro', icon: DollarSign },
                                    { id: 'logs', label: 'Movimentações', icon: History }
                                ].map(tab => (
                                    <button
                                        key={tab.id}
                                        onClick={() => setModalTab(tab.id as any)}
                                        className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold transition-all w-full text-left font-poppins
                                            ${modalTab === tab.id
                                                ? 'bg-[#1c2d4f] text-white shadow-md ring-1 ring-[#1c2d4f]'
                                                : 'text-slate-500 hover:bg-white hover:text-[#1c2d4f] hover:shadow-sm'}`}
                                    >
                                        <tab.icon size={15} className={modalTab === tab.id ? 'text-white' : 'text-slate-400 shrink-0'} />
                                        <span className="flex-1 truncate">{tab.label}</span>
                                    </button>
                                ))}
                            </div>

                            {/* MOBILE TABS */}
                            <div className="md:hidden border-b border-slate-200 bg-white px-3 py-2 flex gap-2 overflow-x-auto custom-scrollbar shrink-0">
                                {[
                                    { id: 'dados', label: 'Dados Gerais', icon: LayoutDashboard },
                                    { id: 'financial', label: 'Financeiro', icon: DollarSign },
                                    { id: 'logs', label: 'Movimentações', icon: History }
                                ].map(tab => (
                                    <button
                                        key={tab.id}
                                        onClick={() => setModalTab(tab.id as any)}
                                        className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap font-poppins
                                            ${modalTab === tab.id
                                                ? 'bg-[#1c2d4f] text-white shadow-md'
                                                : 'bg-slate-50 text-slate-500 border border-slate-200'}`}
                                    >
                                        <tab.icon size={13} className={modalTab === tab.id ? 'text-white' : 'text-slate-400'} />
                                        {tab.label}
                                    </button>
                                ))}
                            </div>

                            {/* MAIN CONTENT */}
                            <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50/50 custom-scrollbar relative">
                            <form onSubmit={handleSubmit} id="stock-item-form">
                                {modalTab === 'dados' && (
                                    <div className="max-w-3xl mx-auto space-y-6 pb-20">
                                            {/* Photo Upload Card at the Top */}
                                            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between gap-6 cursor-pointer hover:border-slate-300 transition-all group" onClick={() => fileInputRef.current?.click()}>
                                                <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleImageUpload} />
                                                <div className="flex items-center gap-6">
                                                    <div className="w-24 h-24 rounded-2xl bg-slate-50 border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden group-hover:border-primary-300 transition-colors shrink-0 relative">
                                                        {imageUploading ? (
                                                            <Loader2 size={24} className="text-primary-500 animate-spin" />
                                                        ) : formData.imageUrl ? (
                                                            <img src={formData.imageUrl} className="w-full h-full object-cover" alt="Produto" />
                                                        ) : (
                                                            <Camera size={28} className="text-slate-300 group-hover:text-primary-400 transition-colors" />
                                                        )}
                                                    </div>
                                                    <div>
                                                        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-tight flex items-center gap-2">
                                                            Foto Representativa do Produto
                                                        </h3>
                                                        <p className="text-xs text-slate-500 mt-1 max-w-sm">
                                                            {formData.imageUrl ? 'Clique para substituir a imagem atual. O painel cuidará do upload.' : 'Nenhuma imagem configurada. Clique aqui para buscar.'}
                                                        </p>
                                                        {formData.imageUrl && (
                                                            <button
                                                                type="button"
                                                                onClick={(e) => { e.stopPropagation(); setFormData({...formData, imageUrl: ''}); }}
                                                                className="text-[10px] font-bold text-rose-500 mt-2 hover:text-rose-600 uppercase tracking-widest flex items-center gap-1"
                                                            >
                                                                <Trash2 size={12} /> Remover Foto
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

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
                                                        <label className="text-[11px] font-medium text-slate-400 block px-1">Cod de barra ou Cod do fabricante</label>
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
                                            {/* Controle Fisico */}
                                            <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm">
                                                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-tight mb-4 flex items-center gap-2"><Box size={16} className="text-slate-400" /> Controle Físico</h3>
                                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                                                    <div className="space-y-1.5">
                                                        <label className="text-[11px] font-medium text-slate-400 block px-1">Posição / Local</label>
                                                        <Input value={formData.location} onChange={e => setFormData({...formData, location: e.target.value})} className="rounded-lg border-slate-200 h-11 text-sm font-semibold" placeholder="Ex: Prateleira A" />
                                                    </div>
                                                    <div className="space-y-1.5">
                                                        <label className="text-[11px] font-medium text-emerald-500 block px-1">Quantidade Atual</label>
                                                        <Input type="number" value={formData.quantity} onChange={e => setFormData({...formData, quantity: e.target.value})} className="rounded-lg border-emerald-200 h-11 text-sm font-bold bg-emerald-50/30 focus:bg-white text-emerald-700" />
                                                    </div>
                                                    <div className="space-y-1.5">
                                                        <label className="text-[11px] font-medium text-rose-500 block px-1">Mínimo (Alerta)</label>
                                                        <Input type="number" value={formData.minQuantity} onChange={e => setFormData({...formData, minQuantity: e.target.value})} className="rounded-lg border-rose-200 h-11 text-sm font-bold bg-rose-50/30 focus:bg-white text-rose-700" />
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center gap-6">
                                                <div className="flex-1 flex flex-col sm:flex-row items-center gap-6">
                                                    {formData.code ? (
                                                        <>
                                                            <div className="bg-white p-2 border-2 border-dashed border-slate-200 rounded-xl shrink-0">
                                                                <img 
                                                                    src={`https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(formData.code)}`} 
                                                                    alt="QR Code"
                                                                    className="w-[80px] h-[80px]"
                                                                />
                                                            </div>
                                                            <div className="flex-1 text-center sm:text-left space-y-2">
                                                                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-tight flex items-center justify-center sm:justify-start gap-2"><QrCode size={16} className="text-slate-400" /> Etiqueta QR Code</h3>
                                                                <p className="text-xs font-mono font-bold text-slate-500">{formData.code}</p>
                                                                <Button
                                                                    type="button"
                                                                    onClick={handlePrintQR}
                                                                    className="w-full sm:w-auto h-9 bg-[#1c2d4f] hover:bg-[#253a66] text-white rounded-lg text-xs font-bold font-poppins flex items-center justify-center gap-2 transition-all shadow-sm"
                                                                >
                                                                    <Printer size={14} /> Imprimir Etiqueta
                                                                </Button>
                                                            </div>
                                                        </>
                                                    ) : (
                                                        <div className="w-full p-6 opacity-50 flex flex-col items-center">
                                                            <QrCode size={32} className="mb-2 text-slate-300" />
                                                            <p className="text-[10px] font-bold text-slate-500">Gere ou informe o código SKU primeiro para ver a etiqueta.</p>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                )}

                                {modalTab === 'financial' && (
                                    <div className="max-w-3xl mx-auto space-y-8">
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
                                                        <p className="text-lg font-bold">R$ {calculateTotalCost(formData).toFixed(2)}</p>
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
                                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-600 text-sm font-bold">R$</span>
                                                            <input type="number" step="0.01" value={formData.sellPrice} onChange={e => setFormData({...formData, sellPrice: e.target.value})} className="w-full pl-9 pr-4 py-2.5 bg-emerald-50 border border-emerald-100 rounded-lg text-sm font-bold text-emerald-800 outline-none focus:ring-2 focus:ring-emerald-200 transition-all" />
                                                        </div>
                                                    </div>
                                                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg relative overflow-hidden">
                                                        <div className="relative z-10 flex items-center justify-between">
                                                            <p className="text-[10px] font-bold uppercase text-slate-500">Margem Comercial</p>
                                                            <p className={`text-lg font-bold ${calculateMargin(formData) > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                                {calculateMargin(formData).toFixed(1)}%
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {modalTab === 'logs' && (
                                    <div className="max-w-3xl mx-auto space-y-6">
                                        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                                            <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
                                                <table className="w-full text-left relative">
                                                    <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10 shadow-sm">
                                                    <tr className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                                        <th className="px-6 py-4">Data/Hora</th>
                                                        <th className="px-6 py-4">Operação</th>
                                                        <th className="px-6 py-4">Responsável</th>
                                                        <th className="px-6 py-4 text-center">Volume</th>
                                                        <th className="px-6 py-4 text-right">Saldo Final</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100">
                                                    {itemMovements.length === 0 ? (
                                                        <tr>
                                                            <td colSpan={5} className="py-12 text-center text-slate-400 text-xs italic">Nenhum histórico disponível para este item no momento.</td>
                                                        </tr>
                                                    ) : (
                                                        itemMovements
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
                                    </div>
                                )}
                            </form>
                        </div>
                        </div>
                    </div>
                </div>
            )}

            {/* PRINT LABELS MODAL */}
            {printModalOpen && (
                <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in">
                    <div className="bg-white rounded-xl w-full max-w-sm shadow-2xl overflow-hidden border border-slate-200 flex flex-col">
                        <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center bg-white">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg flex items-center justify-center border bg-[#1c2d4f]/5 border-[#1c2d4f]/10 text-[#1c2d4f]">
                                    <Printer size={16} />
                                </div>
                                <div>
                                    <h2 className="text-sm font-bold text-slate-900 font-poppins">Imprimir Etiquetas</h2>
                                    <p className="text-[10px] font-medium text-slate-500">Configuração de impressão</p>
                                </div>
                            </div>
                            <Button variant="ghost" onClick={() => setPrintModalOpen(false)} className="p-1.5 text-slate-400 hover:text-slate-900">
                                <X size={16} />
                            </Button>
                        </div>
                        <div className="p-5 space-y-4 bg-slate-50/50">
                            <div className="space-y-1.5">
                                <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block px-1">Formato do Papel</label>
                                <select 
                                    value={printConfig.type} 
                                    onChange={e => setPrintConfig({...printConfig, type: e.target.value})}
                                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-primary-100"
                                >
                                    <option value="a4_maxprint_33">Folha A4 Adesiva (Ex: Maxprint/Pimaco 3 Colunas)</option>
                                    <option value="thermal_40x40">Bobina Térmica (40x40mm)</option>
                                </select>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block px-1">Quantidade de Etiquetas</label>
                                <input 
                                    type="number" 
                                    min="1" 
                                    value={printConfig.quantity} 
                                    onChange={e => setPrintConfig({...printConfig, quantity: parseInt(e.target.value) || 1})}
                                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-primary-100"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block px-1">Nome da Empresa (Rodapé)</label>
                                <input 
                                    type="text" 
                                    value={printConfig.companyName} 
                                    onChange={e => setPrintConfig({...printConfig, companyName: e.target.value})}
                                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold uppercase outline-none focus:ring-2 focus:ring-primary-100"
                                />
                            </div>
                        </div>
                        <div className="p-4 border-t border-slate-100 bg-white flex justify-end gap-2">
                            <Button variant="ghost" onClick={() => setPrintModalOpen(false)} className="text-xs font-bold px-4">
                                Cancelar
                            </Button>
                            <Button variant="primary" onClick={executePrintQR} className="bg-[#1c2d4f] hover:bg-[#253a66] text-white text-xs font-bold px-6 py-2 h-9 rounded-lg shadow-md flex items-center gap-2">
                                <Printer size={14} /> Gerar Impressão
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* CATEGORY MODAL */}
            {isCategoryModalOpen && (
                <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-0 lg:p-4 animate-in fade-in">
                    <div className="bg-white rounded-none lg:rounded-xl w-full max-w-md h-full lg:h-auto shadow-2xl overflow-hidden border-0 lg:border border-slate-200 flex flex-col">
                        <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-slate-100 flex justify-between items-center shrink-0 bg-white">
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-lg flex items-center justify-center border bg-emerald-50 border-emerald-100 text-emerald-600 shrink-0">
                                    <Tag size={16} />
                                </div>
                                <div>
                                    <h2 className="text-sm font-semibold text-slate-900 font-poppins">
                                        {editingCategory ? 'Modificar Categoria' : 'Nova Classificação'}
                                    </h2>
                                    <p className="text-[10px] text-slate-500 font-medium mt-0.5">Estrutura organizacional do estoque</p>
                                </div>
                            </div>
                            <button onClick={() => setIsCategoryModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-900 transition-all">
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleCategorySubmit} className="p-4 sm:p-6 space-y-5 flex-1">
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
                                <Button type="button" onClick={() => setIsCategoryModalOpen(false)} variant="ghost" className="h-9 px-5 rounded-xl text-xs">
                                    Cancelar
                                </Button>
                                <Button type="submit" className="h-9 px-6 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white">
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
                    <div className="bg-white rounded-xl w-full max-w-lg shadow-2xl overflow-hidden animate-scale-up border border-slate-200 flex flex-col max-h-[90vh]">
                        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-white shrink-0">
                            <h2 className="text-base font-semibold text-slate-900 font-poppins flex items-center gap-3">
                                <Box className="text-primary-600" size={20} /> Movimentação de Itens
                            </h2>
                            <button type="button" onClick={() => setIsTransferModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-900 transition-all rounded-lg shrink-0">
                                <X size={20} />
                            </button>
                        </div>

                        <form className="p-6 space-y-4 overflow-y-auto custom-scrollbar flex-1" onSubmit={async (e) => {
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
                            <div className="space-y-3">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                                    <div>
                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Ação</label>
                                        <div className="flex bg-slate-100 p-1 rounded-xl h-[42px]">
                                            <button
                                                type="button"
                                                className={`flex-1 text-[10px] font-black uppercase rounded-lg transition-all ${transferData.direction === 'transfer' ? 'bg-white text-[#10b981] shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                                                onClick={() => setTransferData({ ...transferData, direction: 'transfer', itemId: '' })}
                                            >
                                                Enviar p/ Técnico
                                            </button>
                                            <button
                                                type="button"
                                                className={`flex-1 text-[10px] font-black uppercase rounded-lg transition-all ${transferData.direction === 'return' ? 'bg-white text-amber-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                                                onClick={async () => {
                                                    setTransferData({ ...transferData, direction: 'return', itemId: '' });
                                                    if (transferData.techId) {
                                                        const stock = await DataService.getTechStock(transferData.techId);
                                                        setTechStock(stock);
                                                    }
                                                }}
                                            >
                                                Devolver Estoque
                                            </button>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Quantidade</label>
                                        <input
                                            type="number"
                                            required
                                            min="0.1"
                                            step="0.1"
                                            className="w-full px-3 py-2 h-[42px] rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-amber-100"
                                            value={transferData.quantity}
                                            onChange={e => setTransferData({ ...transferData, quantity: e.target.value })}
                                            placeholder="0"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div className="flex flex-col border border-slate-200 rounded-xl overflow-hidden h-[160px] bg-white">
                                        <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex flex-col gap-2 shrink-0">
                                            <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                                                Técnico {transferData.techId && <span className="text-primary-500">(Selecionado)</span>}
                                            </label>
                                            <div className="flex items-center bg-white border border-slate-200 rounded-md px-2 py-1">
                                                <Search size={12} className="text-slate-400 shrink-0" />
                                                <input 
                                                    type="text" 
                                                    placeholder="Filtrar técnico..." 
                                                    className="w-full bg-transparent px-2 text-[10px] font-bold outline-none"
                                                    value={transferTechSearch}
                                                    onChange={e => setTransferTechSearch(e.target.value)}
                                                />
                                            </div>
                                        </div>
                                        <select
                                            required
                                            className="w-full flex-1 px-2 py-1 text-[10px] font-bold text-slate-700 outline-none custom-scrollbar hover:cursor-pointer"
                                            multiple
                                            value={[transferData.techId]}
                                            onChange={async (e) => {
                                                const newTechId = e.target.value;
                                                setTransferData({ ...transferData, techId: newTechId, itemId: '' });
                                                if (newTechId && transferData.direction === 'return') {
                                                    const stock = await DataService.getTechStock(newTechId);
                                                    setTechStock(stock);
                                                }
                                            }}
                                        >
                                            {techs
                                                .filter(t => t.name.toLowerCase().includes(transferTechSearch.toLowerCase()))
                                                .map(t => (
                                                    <option key={t.id} value={t.id} className="p-1.5 hover:bg-slate-50 border-b border-slate-50 last:border-0 rounded-md my-0.5 whitespace-normal leading-tight">
                                                        {t.name}
                                                    </option>
                                                ))
                                            }
                                        </select>
                                    </div>
                                    <div className="flex flex-col border border-slate-200 rounded-xl overflow-hidden h-[160px] bg-white">
                                        <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex flex-col gap-2 shrink-0">
                                            <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                                                Item {transferData.itemId && <span className="text-emerald-500">(Selecionado)</span>}
                                            </label>
                                            <div className="flex items-center bg-white border border-slate-200 rounded-md px-2 py-1">
                                                <Search size={12} className="text-slate-400 shrink-0" />
                                                <input 
                                                    type="text" 
                                                    placeholder="Filtrar item..." 
                                                    className="w-full bg-transparent px-2 text-[10px] font-bold outline-none"
                                                    value={transferItemSearch}
                                                    onChange={e => setTransferItemSearch(e.target.value)}
                                                />
                                            </div>
                                        </div>
                                        <select
                                            required
                                            className="w-full flex-1 px-2 py-1 text-[10px] font-bold text-slate-700 outline-none custom-scrollbar hover:cursor-pointer"
                                            multiple
                                            value={[transferData.itemId]}
                                            onChange={e => setTransferData({ ...transferData, itemId: e.target.value })}
                                        >
                                            {transferData.direction === 'return' ? (
                                                techStock
                                                    .filter(ts => (Number(ts.quantity) || 0) > 0)
                                                    .filter(ts => ts.item?.description?.toLowerCase().includes(transferItemSearch.toLowerCase()) || ts.item?.code?.toLowerCase().includes(transferItemSearch.toLowerCase()))
                                                    .map(ts => (
                                                        <option key={ts.id} value={ts.stockItemId} className="p-1.5 hover:bg-slate-50 border-b border-slate-50 last:border-0 rounded-md my-0.5 whitespace-normal leading-tight">
                                                            (SKU {ts.item?.code}) {ts.item?.description || '...'} - Qtd: {ts.quantity}
                                                        </option>
                                                    ))
                                            ) : (
                                                items
                                                    .filter(i => (Number(i.quantity) || 0) > 0)
                                                    .filter(i => i.description?.toLowerCase().includes(transferItemSearch.toLowerCase()) || i.code?.toLowerCase().includes(transferItemSearch.toLowerCase()))
                                                    .map(i => (
                                                        <option key={i.id} value={i.id} className="p-1.5 hover:bg-slate-50 border-b border-slate-50 last:border-0 rounded-md my-0.5 whitespace-normal leading-tight">
                                                            (SKU {i.code}) {i.description} - Qtd: {i.quantity}
                                                        </option>
                                                    ))
                                            )}
                                        </select>
                                    </div>
                                </div>
                            </div>

                            <Button
                                type="submit"
                                variant="primary"
                                className="w-full mt-2 py-3 bg-[#1c2d4f] hover:bg-[#253a66] text-white rounded-xl font-black uppercase text-[11px] tracking-widest shadow-xl shadow-primary-900/20 transition-all active:scale-95 shrink-0"
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
