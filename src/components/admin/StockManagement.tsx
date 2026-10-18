
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, Barcode, Box, Camera, Check, DollarSign, Edit3, Filter, History, Info, Layers, LayoutDashboard, List, Loader2, Package, Plus, RefreshCw, Save, Scale, Search, Tag, Trash2, TrendingDown, TrendingUp, Users, Wand2, X, Image as ImageIcon, Printer, QrCode, ClipboardCheck, CheckCircle, FileText } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { createPortal } from 'react-dom';
import { useI18n } from '../../i18n';
import { useAuth } from '../../contexts/AuthContext';
import { useDialog } from '../../contexts/DialogContext';
import { DataService } from '../../services/dataService';
import { StorageService } from '../../services/storageService';
import { TenantService } from '../../services/tenantService';
import { Category, StockItem } from '../../types';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Pagination } from '../ui/Pagination';
import { usePermissions } from '../../hooks/usePermissions';

export const StockManagement: React.FC = () => {
    const { t } = useI18n();
    const { isAuthLoading, session } = useAuth();
    const { canCreate, canEdit, canDelete } = usePermissions();
    const { showAlert } = useDialog();

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
        code: 'NX' + Math.floor(100000 + Math.random() * 900000).toString(),
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

    const [qrCodeUrl, setQrCodeUrl] = useState<string>('');

    useEffect(() => {
        const code = (formData.code || '').trim();
        if (code) {
            QRCode.toDataURL(code, {
                width: 256,
                margin: 1,
                color: {
                    dark: '#000000',
                    light: '#ffffff'
                }
            }).then(url => {
                setQrCodeUrl(url);
            }).catch(err => {
                console.error('Erro ao gerar QRCode local:', err);
                setQrCodeUrl(`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(code)}`);
            });
        } else {
            setQrCodeUrl('');
        }
    }, [formData.code]);

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
    const [movDateFrom, setMovDateFrom] = useState('');
    const [movDateTo, setMovDateTo] = useState('');

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
    const [modalTab, setModalTab] = useState<'dados' | 'logs'>('dados');

    // --- Balance State ---
    const [stagedBalances, setStagedBalances] = useState<Record<string, { newQty: number, item: StockItem }>>({});
    const [isCountingBalance, setIsCountingBalance] = useState(false);
    const [isConfirmBalanceModalOpen, setIsConfirmBalanceModalOpen] = useState(false);

    const [balanceReports, setBalanceReports] = useState<any[]>([]);
    const [loadingReports, setLoadingReports] = useState(false);
    const [reportDateFrom, setReportDateFrom] = useState(() => {
        const d = new Date();
        d.setMonth(d.getMonth() - 6);
        return d.toISOString().split('T')[0];
    });
    const [reportDateTo, setReportDateTo] = useState(() => new Date().toISOString().split('T')[0]);
    const [reportSearchCode, setReportSearchCode] = useState('');
    const [reportCurrentPage, setReportCurrentPage] = useState(1);
    const [printModalOpen, setPrintModalOpen] = useState(false);
    const [printConfig, setPrintConfig] = useState({ quantity: 1, type: 'a4_maxprint_33', companyName: '' });

    const handleBatchBalanceSave = () => {
        const keys = Object.keys(stagedBalances);
        if (keys.length === 0) return;
        setIsConfirmBalanceModalOpen(true);
    };

    const executeBatchBalanceSave = async () => {
        setIsConfirmBalanceModalOpen(false);
        const keys = Object.keys(stagedBalances);
        if (keys.length === 0) return;

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
            setIsCountingBalance(false);
            fetchBalanceReports();
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
            if (reportSearchCode) {
                query = query.ilike('reference_id', `%${reportSearchCode}%`);
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

    useEffect(() => {
        setReportCurrentPage(1);
        const timer = setTimeout(() => {
            fetchBalanceReports();
        }, 300);
        return () => clearTimeout(timer);
    }, [reportDateFrom, reportDateTo, reportSearchCode]);

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
            fetchBalanceReports();
            setIsCountingBalance(false);
        }
    }, [activeTab]);

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
                quantity: item.quantity !== undefined && item.quantity !== null ? (item.quantity === 0 ? '' : String(item.quantity)) : '',
                minQuantity: item.minQuantity !== undefined && item.minQuantity !== null ? (item.minQuantity === 0 ? '' : String(item.minQuantity)) : '',
                costPrice: item.costPrice !== undefined && item.costPrice !== null ? (item.costPrice === 0 ? '' : String(item.costPrice)) : '',
                sellPrice: item.sellPrice !== undefined && item.sellPrice !== null ? (item.sellPrice === 0 ? '' : String(item.sellPrice)) : '',
                freightCost: item.freightCost !== undefined && item.freightCost !== null ? (item.freightCost === 0 ? '' : String(item.freightCost)) : '',
                taxPercent: percent > 0 ? percent.toFixed(2) : ''
            });
        } else {
            setEditingItem(null);
            const autoCode = 'NX' + Math.floor(100000 + Math.random() * 900000).toString();
            setFormData({
                code: autoCode, externalCode: '', description: '', category: '', location: '',
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

        // 1. Validação de Formato (Apenas padrões de mercado: JPEG, PNG, WEBP, GIF, HEIC)
        const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'];
        const isImageMime = allowedMimeTypes.includes(file.type.toLowerCase()) || file.type.startsWith('image/');
        const isImageExt = /\.(jpg|jpeg|png|webp|gif|heic|heif)$/i.test(file.name);

        if (!isImageMime && !isImageExt) {
            alert('⚠️ Formato não permitido!\n\nPor favor, selecione apenas imagens válidas nos formatos JPEG, PNG, WEBP, GIF ou HEIC.');
            if (fileInputRef.current) fileInputRef.current.value = '';
            return;
        }

        // 2. Validação de Tamanho Máximo (Limite de Segurança de 10 MB)
        const MAX_SIZE_MB = 10;
        const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;
        if (file.size > MAX_SIZE_BYTES) {
            const fileSizeMB = (file.size / (1024 * 1024)).toFixed(1);
            alert(`⚠️ Imagem muito grande!\n\nO limite máximo permitido é de ${MAX_SIZE_MB} MB.\nA imagem selecionada possui ${fileSizeMB} MB. Por favor, escolha uma imagem menor.`);
            if (fileInputRef.current) fileInputRef.current.value = '';
            return;
        }

        setImageUploading(true);
        try {
            // Compressa a imagem automaticamente para WebP de alta eficiência (~200KB) antes de enviar
            let blobToUpload: Blob = file;
            try {
                blobToUpload = await StorageService.processAndCompress(file);
            } catch (compressErr) {
                console.warn('[StockManagement] Compression fallback, sending original file:', compressErr);
            }

            const prefix = formData.code ? `items/${formData.code}` : `items/temp_${Date.now()}`;
            const path = `inventory/${prefix}/${file.name.replace(/\.[^/.]+$/, "")}.webp`;
            const url = await StorageService.uploadBlob(blobToUpload, path);
            setFormData((prev: any) => ({ ...prev, imageUrl: url }));
        } catch (error: any) {
            alert(`Erro ao enviar imagem:\n${error?.message || 'Verifique a conexão com a nuvem R2.'}`);
            console.error(error);
        } finally {
            setImageUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const generateCode = () => {
        const newCode = 'NX' + Math.floor(100000 + Math.random() * 900000).toString();
        setFormData((prev: any) => ({ ...prev, code: newCode }));
    };

    const handlePrintQR = () => {
        if (!formData.code) return;
        const itemName = (formData.description || '').trim();
        const defaultFooter = itemName ? `${itemName} / DUNO` : 'DUNO';
        setPrintConfig(prev => ({
            ...prev,
            companyName: defaultFooter
        }));
        setPrintModalOpen(true);
    };

    const executePrintQR = () => {
        if (!formData.code) return;
        const printWindow = window.open('', '_blank');
        if (!printWindow) return;
        
        const itemName = (formData.description || 'Produto').replace(/['"]/g, '');
        const qty = printConfig.quantity || 1;
        const footerText = (printConfig.companyName || (itemName ? `${itemName} / DUNO` : 'DUNO')).replace(/['"]/g, '');
        const qrImageSrc = qrCodeUrl || `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(formData.code)}`;

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
                        .company { font-size: 7px; font-weight: bold; text-transform: uppercase; color: #555; margin-top: 2px; line-height: 1.2; word-break: break-word; }
                        .sku { font-size: 11px; font-weight: 900; margin: 1px 0; color: #000; }
                        .desc { font-size: 8px; line-height: 1.2; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; color: #333; }
                    </style>
                </head>
                <body>
                    <div class="page">
                        ${Array.from({length: qty}).map(() => `
                        <div class="label">
                            <img src="${qrImageSrc}" class="qr" />
                            <div class="info">
                                <span class="sku">${formData.code}</span>
                                ${footerText.toUpperCase().includes(itemName.toUpperCase()) ? '' : `<span class="desc">${itemName}</span>`}
                                <span class="company">${footerText}</span>
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
                        .qr { width: 23mm; height: 23mm; margin-bottom: 1.5mm; }
                        .sku { font-size: 11px; font-weight: 900; line-height: 1; margin-bottom: 2px; }
                        .company { font-size: 7.5px; font-weight: bold; text-transform: uppercase; color: #333; line-height: 1.15; max-width: 36mm; word-break: break-word; }
                    </style>
                </head>
                <body>
                    ${Array.from({length: qty}).map(() => `
                    <div class="label">
                        <span class="sku">${formData.code}</span>
                        <img src="${qrImageSrc}" class="qr" />
                        <span class="company">${footerText}</span>
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
            if (!formData.description?.trim()) {
                alert('⚠️ Descrição Obrigatória!\n\nPor favor, informe a descrição do item.');
                setModalTab('dados');
                return;
            }

            // Validação de quantidade (não pode ser vazia, zero ou negativa)
            const qtyStr = String(formData.quantity ?? '').trim().replace(',', '.');
            const qtyNum = Number(qtyStr);
            if (qtyStr === '' || isNaN(qtyNum) || qtyNum <= 0) {
                alert('⚠️ Quantidade Inválida!\n\nA quantidade do item não pode ser igual a zero nem ficar em branco. Por favor, informe uma quantidade válida maior que zero.');
                setModalTab('dados');
                return;
            }

            // Validação de valor/preço de venda (não pode ser vazio, zero ou negativo)
            const sellStr = String(formData.sellPrice ?? '').trim().replace(',', '.');
            const sellNum = Number(sellStr);
            if (sellStr === '' || isNaN(sellNum) || sellNum <= 0) {
                alert('⚠️ Preço de Venda Inválido!\n\nO valor do item não pode ser igual a zero nem ficar em branco. Por favor, informe um valor de venda maior que zero.');
                setModalTab('dados');
                return;
            }

            const minQtyNum = Number(String(formData.minQuantity ?? '').trim().replace(',', '.')) || 0;
            const costPriceNum = Number(String(formData.costPrice ?? '').trim().replace(',', '.')) || 0;
            const freightCostNum = Number(String(formData.freightCost ?? '').trim().replace(',', '.')) || 0;
            const taxPercentNum = Number(String(formData.taxPercent ?? '').trim().replace(',', '.')) || 0;

            const payload: StockItem = {
                ...formData,
                quantity: qtyNum,
                minQuantity: minQtyNum,
                costPrice: costPriceNum,
                sellPrice: sellNum,
                freightCost: freightCostNum,
                taxCost: costPriceNum * (taxPercentNum / 100)
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
            {/* ── TOP LEVEL TAB SWITCHER (Stripe / Linear Style — Idêntico à página Financeiro) ── */}
            <div className="flex items-center justify-between border-b border-slate-200/80 pb-0 mb-4 shrink-0">
                <div className="flex items-center gap-6 overflow-x-auto custom-scrollbar">
                    <button
                        onClick={() => setActiveTab('items')}
                        className={`flex items-center gap-2 pb-3 pt-1 text-sm font-semibold border-b-2 transition-all relative ${
                            activeTab === 'items'
                                ? 'border-[#1c2d4f] text-[#1c2d4f]'
                                : 'border-transparent text-slate-500 hover:text-slate-800'
                        }`}
                    >
                        <List size={16} className={activeTab === 'items' ? 'text-[#1c2d4f]' : 'text-slate-400'} />
                        <span className="whitespace-nowrap">Estoque</span>
                    </button>

                    <button
                        onClick={() => setActiveTab('categories')}
                        className={`flex items-center gap-2 pb-3 pt-1 text-sm font-semibold border-b-2 transition-all relative ${
                            activeTab === 'categories'
                                ? 'border-[#1c2d4f] text-[#1c2d4f]'
                                : 'border-transparent text-slate-500 hover:text-slate-800'
                        }`}
                    >
                        <Tag size={16} className={activeTab === 'categories' ? 'text-[#1c2d4f]' : 'text-slate-400'} />
                        <span className="whitespace-nowrap">Categorias</span>
                    </button>

                    <button
                        onClick={() => setActiveTab('techs')}
                        className={`flex items-center gap-2 pb-3 pt-1 text-sm font-semibold border-b-2 transition-all relative ${
                            activeTab === 'techs'
                                ? 'border-[#1c2d4f] text-[#1c2d4f]'
                                : 'border-transparent text-slate-500 hover:text-slate-800'
                        }`}
                    >
                        <Box size={16} className={activeTab === 'techs' ? 'text-[#1c2d4f]' : 'text-slate-400'} />
                        <span className="whitespace-nowrap">Técnicos</span>
                    </button>

                    <button
                        onClick={() => setActiveTab('movements')}
                        className={`flex items-center gap-2 pb-3 pt-1 text-sm font-semibold border-b-2 transition-all relative ${
                            activeTab === 'movements'
                                ? 'border-[#1c2d4f] text-[#1c2d4f]'
                                : 'border-transparent text-slate-500 hover:text-slate-800'
                        }`}
                    >
                        <Scale size={16} className={activeTab === 'movements' ? 'text-[#1c2d4f]' : 'text-slate-400'} />
                        <span className="whitespace-nowrap">Auditoria</span>
                    </button>

                    <button
                        onClick={() => setActiveTab('balance')}
                        className={`flex items-center gap-2 pb-3 pt-1 text-sm font-semibold border-b-2 transition-all relative ${
                            activeTab === 'balance'
                                ? 'border-[#1c2d4f] text-[#1c2d4f]'
                                : 'border-transparent text-slate-500 hover:text-slate-800'
                        }`}
                    >
                        <ClipboardCheck size={16} className={activeTab === 'balance' ? 'text-[#1c2d4f]' : 'text-slate-400'} />
                        <span className="whitespace-nowrap">Balanço</span>
                    </button>
                </div>
            </div>

            {/* Filtros e Ações da Listagem */}
            {(activeTab === 'items' || activeTab === 'categories' || (activeTab === 'balance' && isCountingBalance)) && (
                <div className="mb-2 sm:mb-4 p-2 sm:p-3 rounded-2xl border border-slate-200/80 bg-white/60 shadow-sm backdrop-blur-md flex flex-wrap lg:flex-nowrap items-center justify-between gap-2 sm:gap-3">

                    {(activeTab === 'items' || activeTab === 'categories' || (activeTab === 'balance' && isCountingBalance)) && (
                        <div className="relative flex-1 min-w-[200px] w-full lg:w-auto">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                            <input
                                type="text"
                                placeholder={
                                    activeTab === 'balance'
                                        ? "Digite ou bipe o cód. da peça / nome..."
                                        : activeTab === 'categories'
                                        ? "Localizar categoria..."
                                        : "Localizar no estoque..."
                                }
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="w-full h-10 bg-white border border-[#1c2d4f]/20 rounded-xl pl-9 pr-4 text-xs text-slate-700 placeholder-slate-400 outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all shadow-sm"
                            />
                        </div>
                    )}

                    <div className="flex items-center gap-2 w-full lg:w-auto justify-end shrink-0">
                        {(activeTab === 'items' || (activeTab === 'balance' && isCountingBalance)) && (
                            <div className="hidden sm:flex items-center bg-white border border-[#1c2d4f]/20 rounded-xl pl-2 pr-1 h-10 shadow-sm max-w-[160px]">
                                <Filter size={12} className="text-slate-400 mr-2 shrink-0" />
                                <select 
                                    value={categoryFilter} 
                                    onChange={e => setCategoryFilter(e.target.value)} 
                                    className="bg-transparent text-[10px] text-slate-600 outline-none w-full cursor-pointer h-full truncate"
                                >
                                    <option value="ALL">Todas Categorias</option>
                                    {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                                </select>
                            </div>
                        )}

                        {activeTab === 'items' && (
                            <Button
                                onClick={() => setIsRestockModalOpen(true)}
                                className="flex h-10 px-3 bg-[#1c2d4f] hover:bg-[#253a66] border-[#1c2d4f] text-white text-[10px] shadow-lg shadow-[#1c2d4f]/20 items-center gap-1.5 transition-all rounded-xl"
                            >
                                <Scale size={14} /> Entrada
                            </Button>
                        )}

                        {(activeTab === 'items' || activeTab === 'categories') && (
                            <Button
                                onClick={(e) => {
                                    if (!canCreate('stock')) { e.preventDefault(); showAlert('Acesso Negado: Você não tem permissão para esta ação.'); return; }
                                    activeTab === 'items' ? handleOpenModal() : handleOpenCategoryModal()
                                }}
                                className={`flex h-10 px-3 sm:px-4 bg-[#10b981] hover:bg-[#059669] border-[#10b981] text-white text-[11px] shadow-lg shadow-[#10b981]/20 items-center gap-1.5 whitespace-nowrap transition-all rounded-xl ${!canCreate('stock') ? 'opacity-50 !cursor-not-allowed' : ''}`}
                            >
                                <Plus size={14} /> {activeTab === 'items' ? 'Novo Cadastro' : 'Nova Categoria'}
                            </Button>
                        )}

                        {activeTab === 'items' && (
                            <>
                                <button
                                    onClick={handleExportExcelStock}
                                    title="Exportar para Excel / CSV"
                                    className="hidden sm:flex h-10 px-3 bg-white border border-emerald-200 text-emerald-600 hover:bg-emerald-50 text-[10px] items-center gap-1.5 rounded-xl transition-all shadow-sm whitespace-nowrap"
                                >
                                    <FileText size={14} /> Excel
                                    {selectedItems.size > 0 && <span className="ml-1 bg-emerald-100 text-emerald-700 text-[9px] font-black px-1.5 py-0.5 rounded-full">{selectedItems.size}</span>}
                                </button>
                                <button
                                    onClick={handlePrintStock}
                                    title="Imprimir relatório PDF paisagem"
                                    className="hidden sm:flex h-10 px-3 bg-white border border-[#1c2d4f]/20 text-[#1c2d4f] hover:bg-slate-50 text-[10px] items-center gap-1.5 rounded-xl transition-all shadow-sm whitespace-nowrap"
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
            )}

            {/* Standard System Table Container (Estoque e Categorias na tabela padrão do sistema) */}
            {(activeTab === 'items' || activeTab === 'categories') && (
                <div className="bg-white border border-slate-300/80 rounded-xl shadow-lg shadow-slate-200/50 flex flex-col flex-1 ring-1 ring-slate-200/80 stock-table-container">
                    {activeTab === 'items' && (
                        <>
                        <div className="hidden md:block flex-1 overflow-auto custom-scrollbar">
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
                                <tbody key={currentPage} className="animate-fade-in duration-200">
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
                                                            <div className="flex items-center gap-2.5">
                                                                {item.imageUrl && (
                                                                    <div className="w-8 h-8 rounded-lg border border-slate-200 bg-white overflow-hidden shrink-0 flex items-center justify-center p-0.5 shadow-2xs">
                                                                        <img src={item.imageUrl} alt={item.description} className="w-full h-full object-contain" />
                                                                    </div>
                                                                )}
                                                                <div className="min-w-0 flex-1">
                                                                    <p className="text-[12px] font-medium text-slate-700 truncate max-w-[220px]">{item?.description || 'Item sem descrição'}</p>
                                                                    <div className="flex gap-1.5 overflow-hidden">
                                                                        <span className="text-[10px] text-slate-400 truncate">{item?.category || '-'}</span>
                                                                        <span className="text-[10px] text-slate-300 shrink-0">•</span>
                                                                        <span className="text-[10px] text-slate-400 shrink-0">{item?.unit || 'UN'}</span>
                                                                    </div>
                                                                </div>
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
                                                                        onClick={(e) => {
                                                                            if (!canEdit('stock')) { e.preventDefault(); e.stopPropagation(); showAlert('Acesso Negado: Você não tem permissão para editar.'); return; }
                                                                            e.stopPropagation(); handleOpenModal(item);
                                                                        }} 
                                                                        variant="secondary"
                                                                        size="sm"
                                                                        className={`p-2 text-primary-600 bg-primary-50 hover:bg-primary-600 hover:text-white rounded-lg border border-primary-200 transition-all ${!canEdit('stock') ? 'opacity-50 !cursor-not-allowed' : ''}`} 
                                                                        title="Ver Detalhes"
                                                                    >
                                                                        <Package size={14} />
                                                                    </Button>
                                                                    <Button 
                                                                        onClick={(e) => {
                                                                            if (!canDelete('stock')) { e.preventDefault(); e.stopPropagation(); showAlert('Acesso Negado: Você não tem permissão para excluir.'); return; }
                                                                            e.stopPropagation(); handleDelete(item.id);
                                                                        }} 
                                                                        variant="danger"
                                                                        size="sm"
                                                                        className={`p-2 text-rose-400 bg-rose-50 hover:bg-rose-600 hover:text-white rounded-lg border border-transparent hover:border-rose-200 transition-all ${!canDelete('stock') ? 'opacity-50 !cursor-not-allowed' : ''}`} 
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

                        {/* 📱 MOBILE CARDS VIEW - ITEMS */}
                        <div className="md:hidden flex-1 overflow-auto custom-scrollbar bg-slate-50/50 p-2 space-y-2 pb-32">
                            {error ? (
                                <div className="py-10 text-center px-4">
                                    <AlertTriangle size={32} className="mx-auto text-rose-500 mb-4 animate-pulse" />
                                    <p className="text-xs font-bold text-slate-500 mb-4">{error}</p>
                                    <button onClick={() => loadAll()} className="px-6 py-2 bg-[#1c2d4f] text-white text-[10px] font-black uppercase rounded-xl hover:bg-[#253a66] transition-all flex items-center gap-2 mx-auto">
                                        <RefreshCw size={14} /> Tentar Reconectar
                                    </button>
                                </div>
                            ) : loading ? (
                                <div className="py-16 text-center">
                                    <RefreshCw size={32} className="mx-auto text-primary-600 animate-spin mb-4" />
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sincronizando Estoque...</p>
                                </div>
                            ) : items.length === 0 ? (
                                <div className="py-16 text-center">
                                    <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-slate-100">
                                        <Package size={24} className="text-slate-300" />
                                    </div>
                                    <p className="text-[10px] font-black tracking-widest uppercase text-slate-400">Nenhum item localizado</p>
                                </div>
                            ) : items.map(item => {
                                const margin = calculateMargin(item);
                                return (
                                <div 
                                    key={item.id}
                                    className={`bg-white p-3 rounded-2xl shadow-sm border ${selectedItems.has(item.id) ? 'border-primary-400 ring-1 ring-primary-100' : 'border-slate-200/60'} active:scale-[0.98] transition-all flex flex-col gap-2 relative overflow-hidden`}
                                    onClick={() => handleOpenModal(item)}
                                >
                                    <div className="absolute top-3 right-3 p-2 -m-2 z-10" onClick={(e) => { 
                                        e.stopPropagation(); 
                                        const next = new Set(selectedItems);
                                        if (next.has(item.id)) next.delete(item.id); else next.add(item.id);
                                        setSelectedItems(next);
                                    }}>
                                        <input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-primary-600" checked={selectedItems.has(item.id)} readOnly />
                                    </div>

                                    <div className="flex items-start justify-between gap-2 pr-8">
                                        <div className="flex flex-col gap-1">
                                            <span className="text-[11px] font-bold text-primary-600 tracking-tighter bg-primary-50 px-2 py-0.5 rounded w-max">
                                                {item.code || '---'}
                                            </span>
                                            <h3 className="text-sm font-bold text-slate-800 line-clamp-1">{item.description || 'Item sem descrição'}</h3>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-2 mt-1">
                                        <div className="flex flex-col gap-0.5">
                                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Saldo</span>
                                            <div className="flex items-center gap-1.5">
                                                <span className={`text-sm font-bold tracking-tight ${(item.quantity || 0) <= (item.minQuantity || 0) ? 'text-rose-500' : 'text-slate-900'}`}>{item.quantity || 0} {item.unit || 'UN'}</span>
                                                {(item.quantity || 0) <= (item.minQuantity || 0) && <AlertTriangle size={12} className="text-rose-500 shrink-0" />}
                                            </div>
                                        </div>
                                        <div className="flex flex-col gap-0.5">
                                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Preço Público</span>
                                            <span className="text-sm font-bold text-emerald-600">R$ {(item.sellPrice || 0).toFixed(2)}</span>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                                        <span className="text-[10px] text-slate-500 truncate max-w-[120px]">{item.category || '-'}</span>
                                        <div className={`flex items-center gap-1 text-[10px] font-bold ${margin >= 30 ? 'text-emerald-500' : (margin > 0 ? 'text-amber-500' : 'text-rose-500')}`}>
                                            {margin >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                                            {margin.toFixed(1)}%
                                        </div>
                                    </div>
                                </div>
                            )})}
                        </div>
                        <Pagination
                            currentPage={currentPage}
                            totalPages={totalPages}
                            totalItems={totalItemsCount}
                            itemsPerPage={ITEMS_PER_PAGE}
                            onPageChange={(page) => {
                                setLoading(true);
                                setCurrentPage(page);
                                setTimeout(() => {
                                    const container = document.querySelector('.stock-table-container .overflow-auto') || document.querySelector('.stock-table-container');
                                    if (container) container.scrollTo({ top: 0, behavior: 'smooth' });
                                    const scrollableRoot = document.querySelector('.overflow-y-auto.custom-scrollbar');
                                    if (scrollableRoot) scrollableRoot.scrollTo({ top: 0, behavior: 'smooth' });
                                    window.scrollTo({ top: 0, behavior: 'smooth' });
                                }, 50);
                            }}
                        />
                    </>
                    )}

                    {activeTab === 'categories' && (
                        <>
                            {/* Desktop Table View */}
                            <div className="hidden md:block flex-1 overflow-auto custom-scrollbar">
                                <table className="w-full border-collapse">
                                    <thead className="sticky top-0 bg-slate-200/60 backdrop-blur-md border-b border-slate-300 z-10 shadow-sm">
                                        <tr className="text-[12px] font-semibold text-slate-600 tracking-tight text-left">
                                            <th className="px-6 py-3 font-semibold">Categoria</th>
                                            <th className="px-6 py-3 font-semibold text-center">Status</th>
                                            <th className="px-6 py-3 font-semibold text-right pr-6">Gestão</th>
                                        </tr>
                                    </thead>
                                    <tbody className="animate-fade-in duration-200">
                                        {categories.filter(cat => !searchTerm || cat.name?.toLowerCase().includes(searchTerm.toLowerCase())).length === 0 ? (
                                            <tr>
                                                <td colSpan={3} className="py-20 text-center">
                                                    <Tag size={40} className="mx-auto text-slate-300 mb-4" />
                                                    <p className="text-slate-400 font-medium uppercase text-xs">Nenhuma categoria encontrada.</p>
                                                    {canCreate('stock') && (
                                                        <button onClick={() => handleOpenCategoryModal()} className="mt-4 text-emerald-600 font-semibold text-xs uppercase hover:underline">
                                                            Criar Primeira Categoria
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        ) : (
                                            categories
                                                .filter(cat => !searchTerm || cat.name?.toLowerCase().includes(searchTerm.toLowerCase()))
                                                .map(cat => (
                                                <tr key={cat.id} className="transition-all border-b border-slate-100 group bg-white hover:bg-slate-50">
                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600 border border-emerald-100">
                                                                <Layers size={14} />
                                                            </div>
                                                            <span className="text-[12px] font-medium text-slate-700 tracking-tight">{cat.name}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 text-center">
                                                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider border ${cat.active ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                                                            {cat.active ? 'Ativo' : 'Inativo'}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 text-right pr-6">
                                                        <div className="flex items-center justify-end gap-1.5 transition-opacity">
                                                            <Button onClick={(e) => {
                                                                if (!canEdit('stock')) { e.preventDefault(); showAlert('Acesso Negado: Você não tem permissão para editar.'); return; }
                                                                handleOpenCategoryModal(cat);
                                                            }} 
                                                            variant="secondary"
                                                            size="sm"
                                                            className={`p-2 text-primary-600 bg-primary-50 hover:bg-primary-600 hover:text-white rounded-lg border border-primary-200 transition-all ${!canEdit('stock') ? 'opacity-50 !cursor-not-allowed' : ''}`} 
                                                            title="Editar">
                                                                <Edit3 size={14} />
                                                            </Button>
                                                            <Button onClick={(e) => {
                                                                if (!canDelete('stock')) { e.preventDefault(); showAlert('Acesso Negado: Você não tem permissão para excluir.'); return; }
                                                                handleDeleteCategory(cat.id);
                                                            }} 
                                                            variant="danger"
                                                            size="sm"
                                                            className={`p-2 text-rose-400 bg-rose-50 hover:bg-rose-600 hover:text-white rounded-lg border border-transparent hover:border-rose-200 transition-all ${!canDelete('stock') ? 'opacity-50 !cursor-not-allowed' : ''}`} 
                                                            title="Excluir">
                                                                <Trash2 size={14} />
                                                            </Button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {/* Mobile Cards View (PWA) */}
                            <div className="md:hidden flex-1 overflow-auto custom-scrollbar bg-slate-50/50 p-2.5 space-y-2 pb-28">
                                {categories
                                    .filter(cat => !searchTerm || cat.name?.toLowerCase().includes(searchTerm.toLowerCase()))
                                    .map(cat => (
                                    <div key={cat.id} className="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600 border border-emerald-100 shrink-0">
                                                <Layers size={14} />
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-xs font-medium text-slate-800 truncate">{cat.name}</p>
                                                <span className={`inline-block text-[9px] font-medium px-1.5 py-0.5 rounded mt-0.5 border ${cat.active ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                                                    {cat.active ? 'Ativo' : 'Inativo'}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1.5 shrink-0">
                                            <button 
                                                onClick={(e) => {
                                                    if (!canEdit('stock')) { e.preventDefault(); showAlert('Acesso Negado: Você não tem permissão para editar.'); return; }
                                                    handleOpenCategoryModal(cat);
                                                }} 
                                                className="p-2 text-primary-600 bg-primary-50 rounded-lg border border-primary-100"
                                            >
                                                <Edit3 size={14} />
                                            </button>
                                            <button 
                                                onClick={(e) => {
                                                    if (!canDelete('stock')) { e.preventDefault(); showAlert('Acesso Negado: Você não tem permissão para excluir.'); return; }
                                                    handleDeleteCategory(cat.id);
                                                }} 
                                                className="p-2 text-rose-500 bg-rose-50 rounded-lg border border-rose-100"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>
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
                                if (movDateFrom) {
                                    const itemDateStr = m.created_at ? m.created_at.split('T')[0] : '';
                                    if (itemDateStr && itemDateStr < movDateFrom) return false;
                                }
                                if (movDateTo) {
                                    const itemDateStr = m.created_at ? m.created_at.split('T')[0] : '';
                                    if (itemDateStr && itemDateStr > movDateTo) return false;
                                }
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
                                <div className="space-y-4 font-poppins">
                                    <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2.5">
                                        <Scale size={18} className="text-slate-700" /> Auditoria de Movimentações
                                    </h3>
                                    {/* Filtros Responsivos */}
                                    <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-center">
                                            {/* Pesquisa */}
                                            <div className="relative sm:col-span-2 lg:col-span-5">
                                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                                                <input
                                                    type="text"
                                                    placeholder="Buscar por produto, código, OS ou responsável..."
                                                    value={movSearch}
                                                    onChange={e => setMovSearch(e.target.value)}
                                                    className="w-full h-9 bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 text-xs font-normal text-slate-700 outline-none focus:ring-2 focus:ring-primary-100 transition-all"
                                                />
                                            </div>

                                            {/* Tipo */}
                                            <div className="sm:col-span-1 lg:col-span-3">
                                                <div className="relative h-9 flex items-center bg-slate-50 border border-slate-200 rounded-xl px-2.5">
                                                    <Filter size={14} className="text-slate-400 mr-2 shrink-0" />
                                                    <select
                                                        value={movTypeFilter}
                                                        onChange={e => setMovTypeFilter(e.target.value)}
                                                        className="w-full bg-transparent text-xs font-normal text-slate-700 outline-none cursor-pointer truncate"
                                                    >
                                                        <option value="ALL">Todos os Tipos</option>
                                                        <option value="TRANSFER">Transferência</option>
                                                        <option value="CONSUMPTION">Consumo</option>
                                                        <option value="RESTOCK">Entrada</option>
                                                        <option value="RETURN">Devolução</option>
                                                    </select>
                                                </div>
                                            </div>

                                            {/* Data De / Até (2 Colunas para não transbordar no mobile) */}
                                            <div className="sm:col-span-1 lg:col-span-4 grid grid-cols-2 gap-2">
                                                <div className="flex flex-col gap-0.5">
                                                    <label className="text-[9px] font-medium text-slate-400 uppercase px-0.5">De (Início)</label>
                                                    <input
                                                        type="date"
                                                        value={movDateFrom}
                                                        onChange={e => handleDateValidation(e.target.value, movDateTo)}
                                                        className="w-full h-9 bg-slate-50 border border-slate-200 rounded-xl px-2 text-[11px] font-normal text-slate-700 outline-none cursor-pointer"
                                                    />
                                                </div>
                                                <div className="flex flex-col gap-0.5">
                                                    <label className="text-[9px] font-medium text-slate-400 uppercase px-0.5">Até (Fim)</label>
                                                    <input
                                                        type="date"
                                                        value={movDateTo}
                                                        onChange={e => handleDateValidation(movDateFrom, e.target.value)}
                                                        className="w-full h-9 bg-slate-50 border border-slate-200 rounded-xl px-2 text-[11px] font-normal text-slate-700 outline-none cursor-pointer"
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                                            <span className="text-[10px] font-normal text-slate-400 uppercase tracking-wider">
                                                {filtered.length} registro(s) localizado(s)
                                            </span>
                                            {(movSearch || movTypeFilter !== 'ALL' || movDateFrom || movDateTo) && (
                                                <button
                                                    onClick={() => {
                                                        setMovSearch('');
                                                        setMovTypeFilter('ALL');
                                                        setMovDateFrom('');
                                                        setMovDateTo('');
                                                    }}
                                                    className="text-[10px] font-normal uppercase text-rose-500 hover:text-rose-700 transition-colors"
                                                >
                                                    Limpar Filtros
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto custom-scrollbar">
                                        <table className="w-full text-left border-collapse min-w-[650px]">
                                            <thead className="sticky top-0 bg-slate-200/60 backdrop-blur-md border-b border-slate-300 z-10 shadow-sm font-poppins">
                                                <tr className="text-[12px] font-semibold text-slate-600 tracking-tight text-center">
                                                    <th className="px-6 py-3 text-center font-semibold">Data</th>
                                                    <th className="px-6 py-3 text-center font-semibold">Tipo</th>
                                                    <th className="px-6 py-3 text-left font-semibold">Item</th>
                                                    <th className="px-6 py-3 text-center font-semibold">Qtd.</th>
                                                    <th className="px-6 py-3 text-left font-semibold">Técnico / Admin</th>
                                                    <th className="px-6 py-3 text-left font-semibold">Referência (OS/ORC)</th>
                                                    <th className="px-6 py-3 text-center font-semibold">Fluxo</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {filtered.length === 0 ? (
                                                    <tr><td colSpan={7} className="py-16 text-center text-[10px] font-normal text-slate-400 uppercase tracking-widest">Nenhuma movimentação encontrada</td></tr>
                                                ) : filtered.map(m => (
                                                    <tr key={m.id} className="text-[11px] hover:bg-slate-50/50">
                                                        <td className="px-6 py-2.5 text-center text-slate-500 font-normal">{new Date(m.created_at).toLocaleString('pt-BR')}</td>
                                                        <td className="px-6 py-2.5 text-center">
                                                            <span className={`px-2 py-0.5 rounded text-[10px] font-normal uppercase ${m.type === 'TRANSFER' ? 'bg-primary-50 text-primary-600' :
                                                                m.type === 'CONSUMPTION' ? 'bg-amber-100 text-amber-700' :
                                                                    'bg-emerald-50 text-emerald-600'
                                                                }`}>
                                                                {m.type === 'TRANSFER' ? 'Transferência' : m.type === 'CONSUMPTION' ? 'Consumo' : m.type === 'RETURN' ? 'Devolução' : 'Entrada'}
                                                            </span>
                                                        </td>
                                                        <td className="px-6 py-2.5">
                                                            <p className="font-normal text-slate-700">{m.stock_items?.description}</p>
                                                            <p className="text-[10px] text-slate-400 font-normal">Cód: {m.stock_items?.code}</p>
                                                        </td>
                                                        <td className="px-6 py-2.5 text-center font-normal text-slate-700">{m.quantity}</td>
                                                        <td className="px-6 py-2.5">
                                                            <div className="flex flex-col">
                                                                <span className="font-normal text-slate-700 truncate max-w-[120px]">{m.technician?.name || m.executor?.name || '-'}</span>
                                                                {m.executor?.name && m.executor.name !== m.technician?.name && (
                                                                    <span className="text-[10px] text-slate-400 italic font-normal">Por: {m.executor.name}</span>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-2.5">
                                                            <span className="font-normal text-primary-600 text-xs">{m.reference_id || '-'}</span>
                                                        </td>
                                                        <td className="px-6 py-2.5 text-center text-[10px] font-normal text-slate-400">
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
                            <div className="space-y-4 animate-fade-in font-poppins flex flex-col h-full">
                                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0 px-4 sm:px-6 pt-2 sm:pt-4">
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
                                        {!isCountingBalance ? (
                                            <Button
                                                onClick={() => setIsCountingBalance(true)}
                                                className="h-9 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-sm transition-all flex items-center gap-2"
                                            >
                                                <Plus size={14} /> Novo Balanço
                                            </Button>
                                        ) : (
                                            <Button
                                                onClick={() => { setIsCountingBalance(false); setStagedBalances({}); }}
                                                variant="secondary"
                                                className="h-9 px-4 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs font-bold shadow-sm transition-all flex items-center gap-2 hover:bg-slate-50 hover:text-slate-900"
                                            >
                                                <X size={14} /> Cancelar / Voltar
                                            </Button>
                                        )}
                                    </div>
                                </div>
                                
                                {isCountingBalance ? (
                                    <div className="flex-1 min-h-0 flex flex-col">
                                        <div className="flex-1 overflow-auto custom-scrollbar border-t border-slate-200">
                                            <table className="w-full text-left border-collapse min-w-[700px]">
                                            <thead className="sticky top-0 bg-slate-200/60 backdrop-blur-md border-b border-slate-300 z-10 shadow-sm">
                                                <tr className="text-[12px] font-semibold text-slate-600 tracking-tight text-center">
                                                    <th className="px-3 py-2 text-left pl-6">Item / Produto</th>
                                                    <th className="px-3 py-2 text-center">Saldo Sistema</th>
                                                    <th className="px-3 py-2 text-center">Saldo Físico (Real)</th>
                                                    <th className="px-3 py-2 text-center">Diferença</th>
                                                    <th className="px-3 py-2 text-right pr-6">Ação</th>
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
                                ) : (
                                    <div className="flex-1 flex flex-col overflow-y-auto custom-scrollbar border-t border-slate-200">
                                        <div className="flex items-center gap-3 p-4 shrink-0 bg-white border-b border-slate-200 flex-wrap">
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-2">Filtrar Histórico:</span>
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <input 
                                                    type="text"
                                                    placeholder="Cód. Balanço..."
                                                    value={reportSearchCode}
                                                    onChange={e => setReportSearchCode(e.target.value.toUpperCase())}
                                                    className="bg-slate-50 border border-slate-200 rounded text-[10px] font-bold text-slate-600 outline-none h-[28px] px-2 w-32 placeholder-slate-400 focus:border-[#1c2d4f]/30" 
                                                />
                                                <div className="h-4 w-px bg-slate-200 hidden sm:block"></div>
                                                <input 
                                                    type="date" 
                                                    value={reportDateFrom} 
                                                    onChange={e => setReportDateFrom(e.target.value)} 
                                                    className="bg-slate-50 border border-slate-200 rounded text-[10px] font-bold text-slate-600 outline-none h-[28px] px-2" 
                                                />
                                                <span className="text-[9px] font-black text-slate-400">ATÉ</span>
                                                <input 
                                                    type="date" 
                                                    value={reportDateTo} 
                                                    onChange={e => setReportDateTo(e.target.value)} 
                                                    className="bg-slate-50 border border-slate-200 rounded text-[10px] font-bold text-slate-600 outline-none h-[28px] px-2" 
                                                />
                                                {(reportDateFrom || reportDateTo || reportSearchCode) && (
                                                    <button onClick={() => { setReportDateFrom(''); setReportDateTo(''); setReportSearchCode(''); }} className="px-2 text-[9px] font-bold uppercase text-rose-400 hover:text-rose-600">Limpar</button>
                                                )}
                                            </div>
                                        </div>

                                        {loadingReports ? (
                                            <div className="py-20 text-center">
                                                <Loader2 size={30} className="mx-auto text-primary-600 animate-spin mb-3" />
                                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Buscando Relatórios...</p>
                                            </div>
                                        ) : balanceReports.length === 0 ? (
                                            <div className="py-20 text-center flex-1 flex flex-col justify-center items-center">
                                                <History size={40} className="mx-auto text-slate-300 mb-4" />
                                                <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">Nenhuma auditoria encontrada</p>
                                            </div>
                                        ) : (
                                            <div className="flex-1 flex flex-col overflow-auto">
                                                <div className="flex-1 min-h-0">
                                                    <table className="w-full text-left border-collapse">
                                                        <thead className="sticky top-0 bg-slate-200/60 backdrop-blur-md border-b border-slate-300 z-10 shadow-sm">
                                                            <tr className="text-[12px] font-semibold text-slate-600 tracking-tight text-center">
                                                                <th className="px-4 py-3 text-left pl-6">Referência</th>
                                                                <th className="px-4 py-3 text-left">Data/Hora</th>
                                                                <th className="px-4 py-3 text-center">Itens</th>
                                                                <th className="px-4 py-3 text-left">Responsável</th>
                                                                <th className="px-4 py-3 text-right pr-6">{t.common.actions}</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-slate-100">
                                                            {balanceReports.slice((reportCurrentPage - 1) * 10, reportCurrentPage * 10).map((report: any, idx: number) => (
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
                                                {Math.ceil(balanceReports.length / 10) > 1 && (
                                                    <div className="p-4 border-t border-slate-100 shrink-0 bg-white">
                                                        <Pagination
                                                            currentPage={reportCurrentPage}
                                                            totalPages={Math.ceil(balanceReports.length / 10)}
                                                            totalItems={balanceReports.length}
                                                            itemsPerPage={10}
                                                            onPageChange={setReportCurrentPage}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
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
                                <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">Buscar Item (Cód. Interno ou Fabricante)</label>
                                <div className="relative">
                                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                    <input
                                        autoFocus
                                        value={restockSearch}
                                        onChange={e => handleRestockSearch(e.target.value)}
                                        placeholder="Digite o código exato..."
                                        className="w-full pl-12 pr-4 py-3 rounded-xl border border-slate-300 bg-white text-slate-900 font-bold outline-none focus:border-[#1c2d4f] focus:ring-2 focus:ring-[#1c2d4f]/10 shadow-sm transition-all"
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
                                            <label className="text-[10px] font-bold text-[#1c2d4f] uppercase tracking-wider block mb-1">Qtd. Entrada (+)</label>
                                            <input
                                                type="number"
                                                value={restockQuantity}
                                                onChange={e => setRestockQuantity(e.target.value)}
                                                className="w-full px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 font-black outline-none focus:border-[#1c2d4f] focus:ring-2 focus:ring-[#1c2d4f]/10 shadow-sm transition-all"
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

            {/* ITEM MODAL */}
            {isModalOpen && createPortal(
                <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in">
                    <div className="bg-white rounded-none sm:rounded-2xl w-full max-w-6xl xl:max-w-7xl h-full sm:h-auto sm:max-h-[94vh] shadow-2xl flex flex-col overflow-hidden border-0 sm:border border-slate-200">
                        {/* HEADER */}
                        <div className="px-4 sm:px-6 py-3.5 border-b border-slate-100 flex items-center justify-between bg-white shrink-0 gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                                <div className="w-9 h-9 sm:w-10 sm:h-10 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-center text-[#1c2d4f] shrink-0">
                                    <Package size={20} />
                                </div>
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <h2 className="text-sm sm:text-base font-bold text-slate-900 truncate font-poppins">
                                            {editingItem ? `Produto #${editingItem.code}` : 'Novo Produto'}
                                        </h2>
                                        {editingItem && (
                                            <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border shrink-0 hidden sm:inline-block ${(editingItem.quantity || 0) > (editingItem.minQuantity || 0) ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-rose-50 text-rose-600 border-rose-100'}`}>
                                                {(editingItem.quantity || 0) > (editingItem.minQuantity || 0) ? 'Estoque Regular' : 'Baixo Estoque'}
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-[10px] sm:text-xs text-slate-400 font-medium truncate mt-0.5">
                                        {formData.description || 'Preencha as informações do item de estoque'}
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                                <button
                                    onClick={handleSubmit}
                                    form="stock-item-form"
                                    className="hidden sm:flex h-9 px-4 bg-[#1c2d4f] hover:bg-[#253a66] text-white text-xs font-bold rounded-xl shadow-sm transition-all items-center gap-1.5"
                                >
                                    <Save size={14} /> Salvar
                                </button>
                                <button 
                                    onClick={() => setIsModalOpen(false)} 
                                    className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all"
                                >
                                    <X size={20} />
                                </button>
                            </div>
                        </div>

                        {/* BODY WRAPPER */}
                        <div className="flex flex-col md:flex-row flex-1 overflow-hidden bg-white">
                            
                            {/* SIDEBAR TABS (desktop) */}
                            {editingItem && (
                                <div className="hidden md:flex flex-col w-48 sm:w-52 border-r border-slate-200 bg-slate-50/70 p-3 gap-1 overflow-y-auto custom-scrollbar shrink-0">
                                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 px-2">Navegação</div>
                                    {[
                                        { id: 'dados', label: 'Dados Gerais', icon: LayoutDashboard },
                                        { id: 'logs', label: 'Movimentações', icon: History }
                                    ].map(tab => (
                                        <button
                                            key={tab.id}
                                            onClick={() => setModalTab(tab.id as any)}
                                            className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold transition-all w-full text-left font-poppins
                                                ${modalTab === tab.id
                                                    ? 'bg-[#1c2d4f] text-white shadow-sm ring-1 ring-[#1c2d4f]'
                                                    : 'text-slate-600 hover:bg-white hover:text-slate-900'}`}
                                        >
                                            <tab.icon size={15} className={modalTab === tab.id ? 'text-white' : 'text-slate-400 shrink-0'} />
                                            <span className="flex-1 truncate">{tab.label}</span>
                                        </button>
                                    ))}
                                </div>
                            )}

                            {/* MOBILE TABS */}
                            {editingItem && (
                                <div className="md:hidden border-b border-slate-200 bg-white px-3 py-2 flex gap-2 overflow-x-auto custom-scrollbar shrink-0">
                                    {[
                                        { id: 'dados', label: 'Dados Gerais', icon: LayoutDashboard },
                                        { id: 'logs', label: 'Movimentações', icon: History }
                                    ].map(tab => (
                                        <button
                                            key={tab.id}
                                            onClick={() => setModalTab(tab.id as any)}
                                            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap font-poppins
                                                ${modalTab === tab.id
                                                    ? 'bg-[#1c2d4f] text-white shadow-sm'
                                                    : 'bg-slate-50 text-slate-600 border border-slate-200'}`}
                                        >
                                            <tab.icon size={13} className={modalTab === tab.id ? 'text-white' : 'text-slate-400'} />
                                            {tab.label}
                                        </button>
                                    ))}
                                </div>
                            )}

                            {/* MAIN CONTENT */}
                            <div className="flex-1 overflow-y-auto p-4 sm:p-5 bg-slate-50/50 custom-scrollbar relative">
                            <form onSubmit={handleSubmit} id="stock-item-form">
                                {modalTab === 'dados' && (
                                    <div className="w-full space-y-4 animate-fade-in pb-2">
                                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                            {/* COLUNA 1: IDENTIFICAÇÃO E MÍDIA */}
                                            <div className="space-y-4">
                                                {/* Card Identificação */}
                                                <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-sm space-y-3.5">
                                                    <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                                                        <Info size={15} className="text-slate-400" /> Identificação do Produto
                                                    </h3>
                                                    
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                        <div className="space-y-1">
                                                            <label className="text-[11px] font-bold text-slate-700 block">Código SKU / Interno</label>
                                                            <div className="relative group">
                                                                <Input
                                                                    value={formData.code}
                                                                    onChange={e => setFormData({ ...formData, code: e.target.value })}
                                                                    className="rounded-xl border border-slate-300 font-bold bg-white text-slate-900 focus:border-[#1c2d4f] focus:ring-2 focus:ring-[#1c2d4f]/10 h-10 text-xs shadow-sm pr-9"
                                                                    required
                                                                />
                                                                <button type="button" onClick={generateCode} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[#1c2d4f] p-1.5 hover:bg-slate-100 rounded-lg transition-colors" title="Gerar Código"><Wand2 size={14} /></button>
                                                            </div>
                                                        </div>
                                                        <div className="space-y-1">
                                                            <label className="text-[11px] font-bold text-slate-700 block">Cód. Barras / Fabricante</label>
                                                            <Input
                                                                value={formData.externalCode}
                                                                onChange={e => setFormData({ ...formData, externalCode: e.target.value })}
                                                                className="rounded-xl border border-slate-300 bg-white text-slate-900 focus:border-[#1c2d4f] focus:ring-2 focus:ring-[#1c2d4f]/10 h-10 text-xs shadow-sm"
                                                                icon={<Barcode size={15} className="text-slate-400" />}
                                                                placeholder="Opcional"
                                                            />
                                                        </div>
                                                    </div>

                                                    <div className="space-y-1">
                                                        <label className="text-[11px] font-bold text-slate-700 block">Nome / Descrição do Produto</label>
                                                        <Input
                                                            value={formData.description}
                                                            onChange={e => setFormData({ ...formData, description: e.target.value })}
                                                            className="rounded-xl border border-slate-300 bg-white text-slate-900 focus:border-[#1c2d4f] focus:ring-2 focus:ring-[#1c2d4f]/10 font-semibold h-10 text-xs shadow-sm"
                                                            placeholder="Ex: Filtro de Ar Condicionado Split 12000 BTUs"
                                                            required
                                                        />
                                                    </div>

                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                        <div className="space-y-1">
                                                            <label className="text-[11px] font-bold text-slate-700 block">Categoria</label>
                                                            <select value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })} className="w-full bg-white border border-slate-300 rounded-xl h-10 px-3 text-xs font-semibold text-slate-900 outline-none focus:border-[#1c2d4f] focus:ring-2 focus:ring-[#1c2d4f]/10 transition-all uppercase cursor-pointer shadow-sm">
                                                                <option value="">Sem Categoria</option>
                                                                {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                                                            </select>
                                                        </div>
                                                        <div className="space-y-1">
                                                            <label className="text-[11px] font-bold text-slate-700 block">Unidade de Medida</label>
                                                            <select value={formData.unit} onChange={e => setFormData({ ...formData, unit: e.target.value as any })} className="w-full bg-white border border-slate-300 rounded-xl h-10 px-3 text-xs font-semibold text-slate-900 outline-none focus:border-[#1c2d4f] focus:ring-2 focus:ring-[#1c2d4f]/10 transition-all uppercase cursor-pointer shadow-sm">
                                                                <option value="UN">Unidade (UN)</option>
                                                                <option value="CX">Caixa (CX)</option>
                                                                <option value="M">Metros (M)</option>
                                                                <option value="KG">Quilos (KG)</option>
                                                                <option value="PAR">Par (PAR)</option>
                                                            </select>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Card Foto e QR Code Lado a Lado */}
                                                <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-slate-200 shadow-sm grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                                                    {/* Foto */}
                                                    <div className="flex items-center gap-3 p-2 rounded-lg bg-slate-50/70 border border-slate-200/80">
                                                        <input type="file" ref={fileInputRef} className="hidden" accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif" onChange={handleImageUpload} />
                                                        <div 
                                                            onClick={() => fileInputRef.current?.click()}
                                                            className="w-16 h-16 rounded-xl bg-white border border-dashed border-slate-300 hover:border-primary-400 flex items-center justify-center overflow-hidden shrink-0 cursor-pointer transition-colors relative"
                                                        >
                                                            {imageUploading ? (
                                                                <Loader2 size={18} className="text-primary-500 animate-spin" />
                                                            ) : formData.imageUrl ? (
                                                                <img src={formData.imageUrl} className="w-full h-full object-contain p-1" alt="Produto" />
                                                            ) : (
                                                                <Camera size={20} className="text-slate-400" />
                                                            )}
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <p className="text-xs font-bold text-slate-800 truncate">Foto do Item</p>
                                                            <p className="text-[10px] text-slate-400 truncate mt-0.5">{formData.imageUrl ? 'Imagem anexada' : 'Nenhuma imagem'}</p>
                                                            <div className="flex items-center gap-2 mt-1">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => fileInputRef.current?.click()}
                                                                    className="text-[10px] font-bold text-primary-600 hover:underline uppercase"
                                                                >
                                                                    {formData.imageUrl ? 'Alterar' : 'Buscar'}
                                                                </button>
                                                                {formData.imageUrl && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setFormData({...formData, imageUrl: ''})}
                                                                        className="text-[10px] font-bold text-rose-500 hover:underline uppercase"
                                                                    >
                                                                        Remover
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* QR Code */}
                                                    <div className="flex items-center gap-3 p-2 rounded-lg bg-slate-50/70 border border-slate-200/80">
                                                        <div className="w-16 h-16 rounded-xl bg-white border border-slate-200 p-1 flex items-center justify-center shrink-0">
                                                            {formData.code && qrCodeUrl ? (
                                                                <img src={qrCodeUrl} alt="QR Code" className="w-full h-full object-contain" />
                                                            ) : (
                                                                <QrCode size={20} className="text-slate-300" />
                                                            )}
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <p className="text-xs font-bold text-slate-800 truncate">Etiqueta QR Code</p>
                                                            <p className="text-[10px] font-mono text-slate-500 truncate mt-0.5">{formData.code || 'S/ SKU'}</p>
                                                            {formData.code && (
                                                                <button
                                                                    type="button"
                                                                    onClick={handlePrintQR}
                                                                    className="mt-1 h-6 px-2 bg-[#1c2d4f] hover:bg-[#253a66] text-white rounded-md text-[10px] font-bold flex items-center gap-1 transition-colors shadow-xs"
                                                                >
                                                                    <Printer size={11} /> Imprimir
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* COLUNA 2: CONTROLE FÍSICO & PRECIFICAÇÃO */}
                                            <div className="space-y-4">
                                                {/* Controle Físico */}
                                                <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-sm space-y-3.5">
                                                    <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                                                        <Box size={15} className="text-slate-400" /> Controle Físico de Estoque
                                                    </h3>
                                                    
                                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                                        <div className="space-y-1">
                                                            <label className="text-[11px] font-bold text-slate-700 block">Posição / Local</label>
                                                            <Input 
                                                                value={formData.location} 
                                                                onChange={e => setFormData({...formData, location: e.target.value})} 
                                                                className="rounded-xl border border-slate-300 bg-white text-slate-900 focus:border-[#1c2d4f] focus:ring-2 focus:ring-[#1c2d4f]/10 h-10 text-xs font-semibold shadow-sm" 
                                                                placeholder="Ex: Prateleira A" 
                                                            />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <label className="text-[11px] font-bold text-emerald-700 block">Quantidade Atual</label>
                                                            <Input 
                                                                type="number" 
                                                                step="any" 
                                                                placeholder="0" 
                                                                value={formData.quantity ?? ''} 
                                                                onChange={e => setFormData({...formData, quantity: e.target.value})} 
                                                                onFocus={e => e.target.select()} 
                                                                className="rounded-xl border border-emerald-400 h-10 text-xs font-bold bg-emerald-50/60 focus:bg-white text-emerald-900 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/10 shadow-sm" 
                                                                required
                                                            />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <label className="text-[11px] font-bold text-rose-700 block">Mínimo (Alerta)</label>
                                                            <Input 
                                                                type="number" 
                                                                step="any" 
                                                                placeholder="0" 
                                                                value={formData.minQuantity ?? ''} 
                                                                onChange={e => setFormData({...formData, minQuantity: e.target.value})} 
                                                                onFocus={e => e.target.select()} 
                                                                className="rounded-xl border border-rose-400 h-10 text-xs font-bold bg-rose-50/60 focus:bg-white text-rose-900 focus:border-rose-600 focus:ring-2 focus:ring-rose-500/10 shadow-sm" 
                                                            />
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Precificação Comercial */}
                                                <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-sm space-y-3.5">
                                                    <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                                                        <DollarSign size={15} className="text-emerald-500" /> Valores & Precificação Comercial
                                                    </h3>
                                                    
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                        <div className="space-y-1">
                                                            <label className="text-[11px] font-bold text-slate-700 block">Preço de Compra (Custo)</label>
                                                            <div className="relative">
                                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">R$</span>
                                                                <input 
                                                                    type="number" 
                                                                    step="0.01" 
                                                                    placeholder="0,00" 
                                                                    value={formData.costPrice ?? ''} 
                                                                    onChange={e => setFormData({...formData, costPrice: e.target.value})} 
                                                                    onFocus={e => e.target.select()} 
                                                                    className="w-full pl-9 pr-3 h-10 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 outline-none focus:border-[#1c2d4f] focus:ring-2 focus:ring-[#1c2d4f]/10 shadow-sm transition-all" 
                                                                />
                                                            </div>
                                                        </div>
                                                        <div className="space-y-1">
                                                            <label className="text-[11px] font-bold text-emerald-800 block">Preço de Venda Sugerido</label>
                                                            <div className="relative">
                                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-600 text-xs font-bold">R$</span>
                                                                <input 
                                                                    type="number" 
                                                                    step="0.01" 
                                                                    placeholder="0,00" 
                                                                    value={formData.sellPrice ?? ''} 
                                                                    onChange={e => setFormData({...formData, sellPrice: e.target.value})} 
                                                                    onFocus={e => e.target.select()} 
                                                                    className="w-full pl-9 pr-3 h-10 bg-emerald-50/70 border border-emerald-400 rounded-xl text-xs font-bold text-emerald-950 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/10 shadow-sm transition-all" 
                                                                    required
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                                                        <div className="space-y-1">
                                                            <label className="text-[10px] font-bold text-slate-500 block">Frete / Entregas (R$)</label>
                                                            <input 
                                                                type="number" 
                                                                step="0.01" 
                                                                placeholder="0,00" 
                                                                value={formData.freightCost ?? ''} 
                                                                onChange={e => setFormData({...formData, freightCost: e.target.value})} 
                                                                onFocus={e => e.target.select()} 
                                                                className="w-full px-3 h-9 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-700 outline-none focus:border-slate-400 shadow-xs" 
                                                            />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <label className="text-[10px] font-bold text-slate-500 block">Carga Tributária (%)</label>
                                                            <input 
                                                                type="number" 
                                                                step="0.1" 
                                                                placeholder="0" 
                                                                value={formData.taxPercent ?? ''} 
                                                                onChange={e => setFormData({...formData, taxPercent: e.target.value})} 
                                                                onFocus={e => e.target.select()} 
                                                                className="w-full px-3 h-9 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-700 outline-none focus:border-slate-400 shadow-xs" 
                                                            />
                                                        </div>
                                                    </div>

                                                    {/* KPI Margem e Custo Final */}
                                                    <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between gap-4">
                                                        <div>
                                                            <span className="text-[10px] font-bold text-slate-400 uppercase block">Custo Estimado</span>
                                                            <span className="text-xs font-bold text-slate-800">R$ {calculateTotalCost(formData).toFixed(2)}</span>
                                                        </div>
                                                        <div className="text-right">
                                                            <span className="text-[10px] font-bold text-slate-400 uppercase block">Margem Comercial</span>
                                                            <span className={`text-xs font-bold ${calculateMargin(formData) > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                                {calculateMargin(formData).toFixed(1)}%
                                                            </span>
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

                        {/* FOOTER ACTIONS */}
                        <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
                            <button
                                type="button"
                                onClick={() => setIsModalOpen(false)}
                                className="px-4 py-2.5 bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-100 transition-colors flex items-center gap-1.5"
                            >
                                <X size={15} /> Cancelar
                            </button>
                            <button
                                type="submit"
                                form="stock-item-form"
                                className="flex-1 sm:flex-initial px-6 py-2.5 bg-[#1c2d4f] text-white text-xs font-bold uppercase tracking-wider rounded-xl hover:bg-[#253a66] transition-all shadow-md flex items-center justify-center gap-2"
                            >
                                <Save size={15} /> Salvar Produto
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* PRINT LABELS MODAL */}
            {printModalOpen && createPortal(
                <div className="fixed inset-0 z-[200000] flex items-center justify-center bg-slate-950/60 backdrop-blur-md p-4 animate-in fade-in">
                    <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden border border-slate-200 flex flex-col z-[200001]">
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
                                <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block px-1">Nome do Item / Nome da Empresa (Rodapé)</label>
                                <input 
                                    type="text" 
                                    value={printConfig.companyName} 
                                    onChange={e => setPrintConfig({...printConfig, companyName: e.target.value})}
                                    placeholder="Ex: NOME DO ITEM / DUNO"
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
                </div>,
                document.body
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
                                <span className="text-[11px] font-bold text-slate-700 block px-1">Nome da Categoria</span>
                                <Input
                                    value={categoryFormData.name}
                                    onChange={e => setCategoryFormData({ ...categoryFormData, name: e.target.value })}
                                    className="rounded-xl border border-slate-300 bg-white text-slate-900 font-bold focus:border-[#1c2d4f] focus:ring-2 focus:ring-[#1c2d4f]/10 shadow-sm"
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
            {/* TRANSFER MODAL (Teleportado para document.body com z-[9999] para não ficar atrás do menu lateral e perfeitamente centralizado na tela inteira) */}
            {isTransferModalOpen && createPortal((() => {
                const filteredTechList = techs.filter(t => !transferTechSearch || t.name?.toLowerCase().includes(transferTechSearch.toLowerCase()));
                const availableTransferItems = items
                    .filter(i => (Number(i.quantity) || 0) > 0)
                    .filter(i => !transferItemSearch || i.description?.toLowerCase().includes(transferItemSearch.toLowerCase()) || i.code?.toLowerCase().includes(transferItemSearch.toLowerCase()));
                const availableReturnItems = techStock
                    .filter(ts => (Number(ts.quantity) || 0) > 0)
                    .filter(ts => !transferItemSearch || ts.item?.description?.toLowerCase().includes(transferItemSearch.toLowerCase()) || ts.item?.code?.toLowerCase().includes(transferItemSearch.toLowerCase()));
                const selectedTechObj = techs.find(t => t.id === transferData.techId);
                const selectedItemObj = transferData.direction === 'return'
                    ? techStock.find(ts => ts.stockItemId === transferData.itemId || ts.id === transferData.itemId)?.item
                    : items.find(i => i.id === transferData.itemId);
                const selectedMaxQty = transferData.direction === 'return'
                    ? techStock.find(ts => ts.stockItemId === transferData.itemId || ts.id === transferData.itemId)?.quantity
                    : items.find(i => i.id === transferData.itemId)?.quantity;

                return (
                    <div 
                        className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-3 md:p-6 animate-in fade-in duration-200"
                        onClick={() => setIsTransferModalOpen(false)}
                    >
                        <div 
                            className="bg-white w-full h-full md:h-auto md:max-h-[90vh] md:rounded-2xl max-w-6xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 font-poppins border border-slate-200"
                            onClick={(e) => e.stopPropagation()}
                        >
                            
                            {/* HEADER */}
                            <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-slate-100 flex justify-between items-center bg-white shrink-0">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl flex items-center justify-center border bg-slate-50 border-slate-200 text-[#1c2d4f] shrink-0">
                                        <Box size={20} />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h2 className="text-base sm:text-lg font-semibold text-slate-900 leading-tight">Movimentação de Itens de Estoque</h2>
                                            <span className="hidden sm:inline-flex text-[10px] font-medium text-slate-600 bg-slate-100 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                                                {transferData.direction === 'transfer' ? 'Almoxarifado ➔ Colaborador' : 'Colaborador ➔ Almoxarifado'}
                                            </span>
                                        </div>
                                        <p className="text-xs text-slate-400 mt-0.5">Transferência e controle de carga custodiada entre o estoque central e colaboradores</p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setIsTransferModalOpen(false)}
                                    className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all rounded-xl shrink-0"
                                >
                                    <X size={20} />
                                </button>
                            </div>

                            <form className="flex flex-col flex-1 min-h-0 overflow-hidden" onSubmit={async (e) => {
                                e.preventDefault();
                                if (!transferData.itemId || !transferData.techId || !transferData.quantity || Number(transferData.quantity) <= 0) return;
                                try {
                                    if (transferData.direction === 'return') {
                                        await DataService.returnFromTech(transferData.techId, transferData.itemId, Number(transferData.quantity));
                                        showAlert('Item devolvido ao estoque geral com sucesso!');
                                    } else {
                                        await DataService.transferToTech(transferData.techId, transferData.itemId, Number(transferData.quantity));
                                        showAlert('Transferência ao colaborador concluída com sucesso!');
                                    }
                                    setIsTransferModalOpen(false);
                                    loadItems(currentPage, searchTerm, categoryFilter, statusFilter);
                                    loadMovements();
                                    if (selectedTech?.id === transferData.techId) {
                                        const stock = await DataService.getTechStock(selectedTech.id);
                                        setTechStock(stock);
                                    }
                                } catch (error: any) {
                                    showAlert(error.message || 'Erro ao realizar movimentação.');
                                }
                            }}>
                                {/* BARRA SUPERIOR: TIPO DE MOVIMENTAÇÃO E QUANTIDADE */}
                                <div className="p-4 sm:p-6 bg-slate-50/70 border-b border-slate-100 shrink-0">
                                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                                        <div className="md:col-span-8 flex flex-col gap-1.5">
                                            <label className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider">Tipo de Movimentação</label>
                                            <div className="grid grid-cols-2 gap-2 bg-slate-200/60 p-1 rounded-xl">
                                                <button
                                                    type="button"
                                                    onClick={() => setTransferData({ ...transferData, direction: 'transfer', itemId: '' })}
                                                    className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs font-semibold transition-all ${
                                                        transferData.direction === 'transfer'
                                                            ? 'bg-white text-[#1c2d4f] shadow-sm'
                                                            : 'text-slate-500 hover:text-slate-800'
                                                    }`}
                                                >
                                                    <ArrowUpRight size={16} className={transferData.direction === 'transfer' ? 'text-emerald-600' : 'text-slate-400'} />
                                                    <span>Enviar para Técnico (Carga)</span>
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={async () => {
                                                        setTransferData({ ...transferData, direction: 'return', itemId: '' });
                                                        if (transferData.techId) {
                                                            const stock = await DataService.getTechStock(transferData.techId);
                                                            setTechStock(stock);
                                                        }
                                                    }}
                                                    className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs font-semibold transition-all ${
                                                        transferData.direction === 'return'
                                                            ? 'bg-white text-[#1c2d4f] shadow-sm'
                                                            : 'text-slate-500 hover:text-slate-800'
                                                    }`}
                                                >
                                                    <ArrowDownLeft size={16} className={transferData.direction === 'return' ? 'text-amber-600' : 'text-slate-400'} />
                                                    <span>Devolver ao Estoque Geral</span>
                                                </button>
                                            </div>
                                        </div>

                                        <div className="md:col-span-4 flex flex-col gap-1.5">
                                            <div className="flex items-center justify-between">
                                                <label className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider">Quantidade</label>
                                                {selectedMaxQty !== undefined && selectedMaxQty !== null && (
                                                    <span className="text-[11px] text-slate-500">
                                                        Disponível: <strong className="text-slate-800">{selectedMaxQty}</strong>
                                                    </span>
                                                )}
                                            </div>
                                            <input
                                                type="number"
                                                required
                                                min="0.1"
                                                step="0.1"
                                                max={selectedMaxQty !== undefined && selectedMaxQty !== null ? selectedMaxQty : undefined}
                                                className="w-full px-3 py-2 h-[42px] rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-[#1c2d4f]/20 focus:border-[#1c2d4f] transition-all shadow-sm"
                                                value={transferData.quantity}
                                                onChange={e => setTransferData({ ...transferData, quantity: e.target.value })}
                                                placeholder="Informe a quantidade..."
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* ÁREA DE SELEÇÃO: 2 COLUNAS LADO A LADO */}
                                <div className="p-4 sm:p-6 grid grid-cols-1 md:grid-cols-2 gap-6 flex-1 overflow-y-auto custom-scrollbar min-h-0">
                                    
                                    {/* COLUNA 1: COLABORADOR / TÉCNICO */}
                                    <div className="flex flex-col border border-slate-200 rounded-2xl bg-white overflow-hidden shadow-xs">
                                        <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex flex-col gap-2 shrink-0">
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                                                    <Users size={14} className="text-slate-500" /> 1. Colaborador / Técnico
                                                </span>
                                                {selectedTechObj && (
                                                    <span className="text-[10px] font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                                                        Selecionado
                                                    </span>
                                                )}
                                            </div>
                                            <div className="relative">
                                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                                <input
                                                    type="text"
                                                    placeholder="Buscar técnico por nome..."
                                                    className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-700 placeholder-slate-400 outline-none focus:ring-1 focus:ring-[#1c2d4f] transition-all shadow-2xs"
                                                    value={transferTechSearch}
                                                    onChange={e => setTransferTechSearch(e.target.value)}
                                                />
                                            </div>
                                        </div>

                                        <div className="p-2 space-y-1.5 flex-1 overflow-y-auto custom-scrollbar max-h-[300px] md:max-h-[360px]">
                                            {filteredTechList.length === 0 ? (
                                                <div className="py-12 text-center text-xs text-slate-400">Nenhum técnico localizado</div>
                                            ) : (
                                                filteredTechList.map(t => {
                                                    const isSelected = transferData.techId === t.id;
                                                    return (
                                                        <div
                                                            key={t.id}
                                                            onClick={async () => {
                                                                setTransferData({ ...transferData, techId: t.id, itemId: '' });
                                                                if (transferData.direction === 'return') {
                                                                    const stock = await DataService.getTechStock(t.id);
                                                                    setTechStock(stock);
                                                                }
                                                            }}
                                                            className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                                                                isSelected
                                                                    ? 'bg-[#1c2d4f]/5 border-[#1c2d4f] ring-1 ring-[#1c2d4f] shadow-xs'
                                                                    : 'bg-white border-slate-100 hover:border-slate-200 hover:bg-slate-50'
                                                            }`}
                                                        >
                                                            <div className="flex items-center gap-3 min-w-0">
                                                                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                                                                    isSelected ? 'bg-[#1c2d4f] text-white' : 'bg-slate-100 text-slate-600'
                                                                }`}>
                                                                    {t.name.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase()}
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <p className={`text-xs font-semibold truncate ${isSelected ? 'text-[#1c2d4f]' : 'text-slate-800'}`}>{t.name}</p>
                                                                    <p className="text-[10px] text-slate-400 uppercase tracking-wider">{t.role === 'ADMIN' ? 'Gestão' : 'Operacional'}</p>
                                                                </div>
                                                            </div>
                                                            {isSelected && (
                                                                <Check size={16} className="text-[#1c2d4f] shrink-0" />
                                                            )}
                                                        </div>
                                                    );
                                                })
                                            )}
                                        </div>
                                    </div>

                                    {/* COLUNA 2: PRODUTO / PEÇA */}
                                    <div className="flex flex-col border border-slate-200 rounded-2xl bg-white overflow-hidden shadow-xs">
                                        <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex flex-col gap-2 shrink-0">
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                                                    <Package size={14} className="text-slate-500" /> 2. Produto / Peça
                                                </span>
                                                {selectedItemObj && (
                                                    <span className="text-[10px] font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                                                        Selecionado
                                                    </span>
                                                )}
                                            </div>
                                            <div className="relative">
                                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                                <input
                                                    type="text"
                                                    placeholder="Buscar peça por código ou descrição..."
                                                    className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-700 placeholder-slate-400 outline-none focus:ring-1 focus:ring-[#1c2d4f] transition-all shadow-2xs"
                                                    value={transferItemSearch}
                                                    onChange={e => setTransferItemSearch(e.target.value)}
                                                />
                                            </div>
                                        </div>

                                        <div className="p-2 space-y-1.5 flex-1 overflow-y-auto custom-scrollbar max-h-[300px] md:max-h-[360px]">
                                            {transferData.direction === 'return' && !transferData.techId ? (
                                                <div className="py-16 text-center px-4">
                                                    <Users size={32} className="mx-auto text-slate-300 mb-2" />
                                                    <p className="text-xs font-medium text-slate-500">Selecione um técnico à esquerda</p>
                                                    <p className="text-[10px] text-slate-400 mt-1">Os itens custodiados por ele serão listados aqui para devolução.</p>
                                                </div>
                                            ) : (transferData.direction === 'return' ? availableReturnItems : availableTransferItems).length === 0 ? (
                                                <div className="py-16 text-center text-xs text-slate-400 px-4">
                                                    {transferData.direction === 'return' ? 'Este técnico não possui itens em sua carga ativa.' : 'Nenhum item com saldo positivo localizado no estoque.'}
                                                </div>
                                            ) : (
                                                (transferData.direction === 'return' ? availableReturnItems : availableTransferItems).map((it: any) => {
                                                    const itId = transferData.direction === 'return' ? (it.stockItemId || it.id) : it.id;
                                                    const itDesc = transferData.direction === 'return' ? it.item?.description : it.description;
                                                    const itCode = transferData.direction === 'return' ? it.item?.code : it.code;
                                                    const itUnit = transferData.direction === 'return' ? (it.item?.unit || 'UN') : (it.unit || 'UN');
                                                    const itQty = it.quantity;
                                                    const itCat = transferData.direction === 'return' ? (it.item?.category || 'Geral') : (it.category || 'Geral');
                                                    const isSelected = transferData.itemId === itId;

                                                    return (
                                                        <div
                                                            key={it.id}
                                                            onClick={() => setTransferData({ ...transferData, itemId: itId })}
                                                            className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                                                                isSelected
                                                                    ? 'bg-[#1c2d4f]/5 border-[#1c2d4f] ring-1 ring-[#1c2d4f] shadow-xs'
                                                                    : 'bg-white border-slate-100 hover:border-slate-200 hover:bg-slate-50'
                                                            }`}
                                                        >
                                                            <div className="min-w-0 flex-1 pr-3">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                                                                        #{itCode || '---'}
                                                                    </span>
                                                                    <p className={`text-xs font-semibold truncate ${isSelected ? 'text-[#1c2d4f]' : 'text-slate-800'}`}>
                                                                        {itDesc}
                                                                    </p>
                                                                </div>
                                                                <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-400">
                                                                    <span>{itCat}</span>
                                                                    <span>•</span>
                                                                    <span className="text-slate-600 font-medium">Saldo: <strong className="text-slate-800">{itQty} {itUnit}</strong></span>
                                                                </div>
                                                            </div>
                                                            {isSelected && (
                                                                <Check size={16} className="text-[#1c2d4f] shrink-0" />
                                                            )}
                                                        </div>
                                                    );
                                                })
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* FOOTER: RESUMO E AÇÕES */}
                                <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
                                    <div className="text-xs text-slate-600 text-center sm:text-left">
                                        {selectedTechObj && selectedItemObj && transferData.quantity ? (
                                            <p>
                                                {transferData.direction === 'transfer' ? 'Transferindo ' : 'Devolvendo '}
                                                <strong className="text-slate-900">{transferData.quantity} {selectedItemObj.unit || 'UN'}</strong> de <strong className="text-slate-900">{selectedItemObj.description}</strong> {transferData.direction === 'transfer' ? '➔ para o colaborador ' : '➔ do colaborador '} <strong className="text-[#1c2d4f]">{selectedTechObj.name}</strong>.
                                            </p>
                                        ) : (
                                            <p className="text-slate-400">Selecione o colaborador, o produto e a quantidade desejada.</p>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2.5 w-full sm:w-auto">
                                        <button
                                            type="button"
                                            onClick={() => setIsTransferModalOpen(false)}
                                            className="flex-1 sm:flex-none px-4 py-2.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 rounded-xl text-xs font-medium transition-all"
                                        >
                                            Cancelar
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={!transferData.itemId || !transferData.techId || !transferData.quantity || Number(transferData.quantity) <= 0}
                                            className="flex-1 sm:flex-none px-6 py-2.5 bg-[#1c2d4f] hover:bg-[#253a66] disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-xs font-semibold shadow-lg shadow-primary-900/10 transition-all flex items-center justify-center gap-2"
                                        >
                                            <Check size={16} />
                                            <span>{transferData.direction === 'transfer' ? 'Confirmar Transferência' : 'Confirmar Devolução'}</span>
                                        </button>
                                    </div>
                                </div>
                            </form>
                        </div>
                    </div>
                );
            })(), document.body)}

            {/* Modal Confirm Balance */}
            {isConfirmBalanceModalOpen && (
                <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in">
                    <div className="bg-white rounded-xl w-full max-w-sm shadow-2xl overflow-hidden animate-scale-up border border-slate-200 flex flex-col max-h-[90vh]">
                        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-white shrink-0">
                            <h2 className="text-base font-semibold text-slate-900 font-poppins flex items-center gap-3">
                                <ClipboardCheck className="text-emerald-600" size={20} /> Confirmar Balanço
                            </h2>
                            <button type="button" onClick={() => setIsConfirmBalanceModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-900 transition-all rounded-lg shrink-0">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="p-6 text-center space-y-4">
                            <div className="w-16 h-16 bg-emerald-50 border border-emerald-100 rounded-full flex items-center justify-center mx-auto text-emerald-500 mb-2">
                                <AlertTriangle size={32} />
                            </div>
                            <p className="text-sm font-medium text-slate-600 leading-relaxed">
                                Deseja confirmar o balanço de <strong className="text-slate-900 font-black">{Object.keys(stagedBalances).length}</strong> item(ns)?<br/><br/>
                                <span className="text-xs text-slate-400 uppercase tracking-widest font-bold">Uma auditoria será gerada para este lote.</span>
                            </p>
                        </div>
                        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center gap-3 shrink-0">
                            <Button 
                                onClick={() => setIsConfirmBalanceModalOpen(false)} 
                                variant="secondary" 
                                className="flex-1 bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 shadow-sm text-xs font-bold"
                            >
                                Cancelar
                            </Button>
                            <Button 
                                onClick={executeBatchBalanceSave} 
                                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-500/20 text-xs font-bold flex items-center justify-center gap-2"
                            >
                                <Save size={16} /> Confirmar
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* MOBILE FABS */}
            {activeTab === 'items' && canCreate('stock') && (
                <div className="md:hidden fixed bottom-24 right-4 flex flex-col gap-3 z-50">
                    <button
                        onClick={() => setIsRestockModalOpen(true)}
                        className="w-12 h-12 bg-white text-[#1c2d4f] border border-[#1c2d4f]/20 rounded-full shadow-[0_8px_30px_rgba(0,0,0,0.1)] flex items-center justify-center active:scale-90 transition-transform"
                    >
                        <Scale size={20} />
                    </button>
                    <button
                        onClick={() => handleOpenModal()}
                        className="w-14 h-14 bg-gradient-to-tr from-[#10b981] to-[#059669] text-white rounded-full shadow-[0_8px_30px_rgba(16,185,129,0.4)] flex items-center justify-center active:scale-90 transition-transform"
                    >
                        <Plus size={24} />
                    </button>
                </div>
            )}
            {activeTab === 'categories' && canCreate('stock') && (
                <button
                    onClick={() => handleOpenCategoryModal()}
                    className="md:hidden fixed bottom-24 right-4 w-14 h-14 bg-gradient-to-tr from-[#10b981] to-[#059669] text-white rounded-full shadow-[0_8px_30px_rgba(16,185,129,0.4)] flex items-center justify-center z-50 active:scale-90 transition-transform"
                >
                    <Plus size={24} />
                </button>
            )}
        </div>
    );
};
