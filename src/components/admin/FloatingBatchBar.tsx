import React from 'react';
import { FileSpreadsheet, FileText, X, Loader2 } from 'lucide-react';

interface FloatingBatchBarProps {
    count?: number;
    selectedCount?: number;
    totalAmount?: number;
    onExportExcel: () => void;
    onPrintPdf: () => void;
    onClearSelection: () => void;
    extraAction?: {
        label: string;
        icon?: React.ReactNode;
        onClick: () => void;
        className?: string;
        disabled?: boolean;
    };
    primaryAction?: {
        label: string;
        icon?: React.ReactNode;
        onClick: () => void;
        className?: string;
        disabled?: boolean;
    };
    isExporting?: boolean;
    isPrinting?: boolean;
}

export const FloatingBatchBar: React.FC<FloatingBatchBarProps> = ({
    count,
    selectedCount,
    totalAmount,
    onExportExcel,
    onPrintPdf,
    onClearSelection,
    extraAction,
    primaryAction,
    isExporting = false,
    isPrinting = false,
}) => {
    const actualCount = count ?? selectedCount ?? 0;
    if (actualCount <= 0) return null;
    const action = extraAction || primaryAction;

    const formatCurrency = (val: number) =>
        new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

    return (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-1.5 px-3.5 py-2.5 bg-slate-900/95 backdrop-blur-md border border-white/10 rounded-2xl shadow-2xl animate-in fade-in slide-in-from-bottom-4 zoom-in-95 print:hidden">
            <div className="flex items-center gap-2 pl-1 pr-3 border-r border-white/10">
                <div className="flex items-center justify-center w-6 h-6 rounded-full bg-emerald-500 text-white text-[11px] font-bold shadow-inner">
                    {count}
                </div>
                <span className="text-xs font-medium text-slate-300 tracking-wide">
                    {count === 1 ? 'Selecionado' : 'Selecionados'}
                </span>
                {totalAmount !== undefined && (
                    <span className="text-xs font-bold text-emerald-400 ml-1">
                        ({formatCurrency(totalAmount)})
                    </span>
                )}
            </div>

            <button
                type="button"
                onClick={onExportExcel}
                disabled={isExporting}
                className="flex items-center gap-2 px-3 py-1.5 text-slate-300 hover:text-emerald-400 hover:bg-white/5 rounded-lg transition-all disabled:opacity-50 text-xs font-medium cursor-pointer"
                title="Exportar Seleção para Planilha Excel (.xlsx)"
            >
                {isExporting ? <Loader2 size={15} className="animate-spin" /> : <FileSpreadsheet size={15} />}
                <span>Excel</span>
            </button>

            <button
                type="button"
                onClick={onPrintPdf}
                disabled={isPrinting}
                className="flex items-center gap-2 px-3 py-1.5 text-slate-300 hover:text-blue-400 hover:bg-white/5 rounded-lg transition-all disabled:opacity-50 text-xs font-medium cursor-pointer"
                title="Imprimir ou Salvar Relatório em PDF no Padrão Consolidado"
            >
                {isPrinting ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />}
                <span>PDF</span>
            </button>

            {action && (
                <>
                    <div className="w-px h-5 bg-white/10 mx-1" />
                    <button
                        type="button"
                        onClick={action.onClick}
                        disabled={action.disabled}
                        className={action.className || "flex items-center gap-2 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-all text-xs font-medium shadow-sm disabled:opacity-50 cursor-pointer"}
                    >
                        {action.icon}
                        <span>{action.label}</span>
                    </button>
                </>
            )}

            <div className="w-px h-5 bg-white/10 mx-1" />

            <button
                type="button"
                onClick={onClearSelection}
                className="flex items-center justify-center w-8 h-8 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all cursor-pointer"
                title="Limpar Seleção"
            >
                <X size={16} />
            </button>
        </div>
    );
};
