import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    itemsPerPage: number;
    onPageChange: (page: number) => void;
}

export const Pagination: React.FC<PaginationProps> = ({
    currentPage,
    totalPages,
    totalItems,
    itemsPerPage,
    onPageChange
}) => {
    // Se não houver itens ou apenas uma página, mostra apenas o contador para manter o layout fixo se desejado,
    // mas o usuário pediu botões de próximo/voltar.

    const startIdx = totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
    const endIdx = Math.min(currentPage * itemsPerPage, totalItems);

    return (
        <div className="flex items-center justify-between px-8 py-4 bg-white border-t border-slate-50 shrink-0 select-none">
            <div className="flex items-center gap-2">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
                    Total: <span className="text-slate-900">{totalItems}</span> {totalItems === 1 ? 'Registro' : 'Registros'}
                    <span className="mx-3 text-slate-200">|</span>
                    Exibindo {startIdx}-{endIdx}
                </span>
            </div>

            <div className="flex items-center gap-1">
                <button
                    onClick={() => onPageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="flex items-center gap-1 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-all disabled:opacity-20 disabled:cursor-not-allowed group"
                >
                    <ChevronLeft size={14} className="group-hover:-translate-x-0.5 transition-transform" />
                    Voltar
                </button>

                <div className="flex items-center px-4 h-8 bg-slate-50 rounded-lg border border-slate-100">
                    <span className="text-[10px] font-black text-slate-900 uppercase">
                        Página {currentPage} <span className="text-slate-300 mx-1">/</span> {totalPages || 1}
                    </span>
                </div>

                <button
                    onClick={() => onPageChange(currentPage + 1)}
                    disabled={currentPage === totalPages || totalPages === 0}
                    className="flex items-center gap-1 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-all disabled:opacity-20 disabled:cursor-not-allowed group"
                >
                    Próxima
                    <ChevronRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
                </button>
            </div>
        </div>
    );
};
