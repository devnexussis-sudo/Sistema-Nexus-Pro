import React from 'react';
import { Wallet, ShieldCheck, CheckCircle2 } from 'lucide-react';

const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
};

export interface InvoiceReceiptProps {
    invoice: any;
    invoiceItems: any[];
    rawItems: any[];
    customers?: any[];
    tenantInfo?: {
        name?: string;
        document?: string;
        phone?: string;
        address?: string;
        logoUrl?: string;
        email?: string;
        website?: string;
    };
}

export const InvoiceReceiptTemplate: React.FC<InvoiceReceiptProps> = ({ 
    invoice, 
    invoiceItems, 
    rawItems, 
    customers = [], 
    tenantInfo 
}) => {
    if (!invoice) return null;

    // Busca cliente completo na lista de clientes cadastrados
    const fullCust = customers.find(c => 
        (c.document && invoice.customer_document && c.document.replace(/\D/g, '') === invoice.customer_document.replace(/\D/g, '')) ||
        (c.name?.toLowerCase().trim() === invoice.customer_name?.toLowerCase().trim())
    );

    const getDocLabel = (raw: any, ii: any) => {
        if (raw?.displayId) return raw.displayId;
        if (raw?.display_id) return raw.display_id;
        if (raw?.original?.displayId) return raw.original.displayId;
        if (raw?.original?.display_id) return raw.original.display_id;
        if (ii?.display_id) return ii.display_id;

        const isQuote = raw?.type === 'QUOTE' || ii?.reference_type === 'QUOTE';
        const prefix = isQuote ? 'ORC' : 'OS';
        
        const rawId = raw?.id || ii?.reference_id || ii?.id;
        if (!rawId) return `${prefix}-0000`;

        const idStr = String(rawId);
        if (idStr.includes('-')) {
            return `${prefix}-${idStr.split('-')[0].toUpperCase()}`;
        }
        return `${prefix}-${idStr.padStart(4, '0')}`;
    };

    let billedItems = (invoiceItems || [])
        .filter(ii => !invoice?.id || ii.invoice_id === invoice.id)
        .map(ii => {
            const raw = (rawItems || []).find(r => r.id === ii.reference_id);
            const isQuote = raw?.type === 'QUOTE' || ii.reference_type === 'QUOTE';
            return {
                ...ii,
                raw,
                title: ii.description || ii.title || raw?.title || raw?.description || (isQuote ? 'Orçamento de Serviço' : 'Ordem de Serviço'),
                date: ii.created_at || raw?.createdAt || raw?.created_at || invoice.created_at,
                typeLabel: isQuote ? 'ORÇAMENTO' : (ii.reference_type || 'O.S.'),
                docLabel: getDocLabel(raw, ii),
                amount: ii.amount || ii.total_price || raw?.totalValue || raw?.total_value || 0
            };
        });

    // Fallback: Se billedItems estiver vazio, sintetiza a partir de invoice.items ou rawItems
    if (billedItems.length === 0) {
        if (invoice?.items && Array.isArray(invoice.items) && invoice.items.length > 0) {
            billedItems = invoice.items.map((it: any, idx: number) => ({
                id: it.id || String(idx + 1),
                invoice_id: invoice.id,
                title: it.description || it.name || it.title || 'Item de Serviço/Produto',
                amount: Number(it.total || (Number(it.unitPrice || it.unit_price || 0) * Number(it.quantity || 1)) || 0),
                quantity: Number(it.quantity || 1),
                unit_price: Number(it.unitPrice || it.unit_price || 0),
                typeLabel: 'ITEM',
                docLabel: invoice.display_id || `FAT-${String(idx + 1).padStart(3, '0')}`,
                date: invoice.created_at
            }));
        } else if (rawItems && rawItems.length > 0) {
            billedItems = rawItems.map((raw: any, idx: number) => ({
                id: raw.id || String(idx + 1),
                invoice_id: invoice.id,
                raw,
                title: raw.title || raw.description || 'Ordem de Serviço',
                amount: Number(raw.totalValue || raw.total_value || raw.total_amount || 0),
                typeLabel: raw.type === 'QUOTE' ? 'ORÇAMENTO' : 'O.S.',
                docLabel: raw.displayId || raw.display_id || raw.id,
                date: raw.createdAt || raw.created_at || invoice.created_at
            }));
        }
    }

    // Extrai dados completos de endereço e contato do cliente
    const firstRawOrig = billedItems[0]?.raw?.original;
    const doc = invoice.customer_document || fullCust?.document || (fullCust as any)?.cpf || (fullCust as any)?.cnpj || firstRawOrig?.customer_document || firstRawOrig?.customerDocument || 'Não informado';
    const phone = fullCust?.whatsapp || fullCust?.phone || firstRawOrig?.customerPhone || (billedItems[0]?.raw as any)?.customerPhone;
    const email = fullCust?.email || firstRawOrig?.customerEmail || (billedItems[0]?.raw as any)?.customerEmail;

    let customerAddress = (billedItems[0]?.raw as any)?.customerAddress || firstRawOrig?.customerAddress;
    if (!customerAddress || customerAddress.trim() === '') {
        if (fullCust && fullCust.street) {
            customerAddress = `${fullCust.street}, ${fullCust.number || 'S/N'}${fullCust.neighborhood ? ' - ' + fullCust.neighborhood : ''}${fullCust.city ? ', ' + fullCust.city : ''}${fullCust.state ? '/' + fullCust.state : ''}${fullCust.zip ? ' (CEP: ' + fullCust.zip + ')' : ''}`;
        } else {
            customerAddress = 'Endereço Não Informado';
        }
    }

    const isPaid = (invoice.status || '').toUpperCase() === 'PAID';
    const subtotal = invoice.total_amount || 0;
    const discount = invoice.discount_amount || 0;
    const shipping = invoice.shipping_amount || 0;
    const additions = invoice.other_additions_amount || 0;
    const totalLiquid = Math.max(0, subtotal - discount + shipping + additions);

    return (
        <div className="bg-white text-[10px] leading-tight font-poppins p-6 print:p-0 print:break-inside-avoid min-h-[1056px] flex flex-col relative w-[210mm] mx-auto print:w-full" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
            {/* Marca D'Água (Status do Voucher) */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-[0.03] pointer-events-none select-none text-[8rem] font-semibold uppercase -rotate-45 tracking-widest whitespace-nowrap z-0">
                {isPaid ? 'LIQUIDADO' : 'PENDENTE'}
            </div>

            <div className="relative z-10 flex-1 flex flex-col">
                {/* Cabeçalho do Voucher */}
                <div className="flex justify-between items-start pb-4 border-b-2 border-slate-800 mb-4">
                    <div className="flex gap-4 items-center">
                        {tenantInfo?.logoUrl ? (
                            <img
                                src={tenantInfo.logoUrl}
                                alt={tenantInfo.name || 'Logo'}
                                className="h-16 w-auto object-contain"
                            />
                        ) : (
                            <div className="bg-slate-900 p-2 rounded-lg flex items-center justify-center min-w-[60px] min-h-[60px] text-white">
                                <Wallet size={32} className="text-white fill-white/10" />
                            </div>
                        )}
                        <div className="space-y-1">
                            <h1 className="text-xl font-medium text-slate-900 uppercase tracking-tight">{tenantInfo?.name || 'Sua Empresa'}</h1>
                            <div className="text-[9px] text-slate-600 max-w-[400px]">
                                {tenantInfo?.address || 'Endereço da Empresa Não Informado'}
                                <div className="flex flex-wrap gap-x-3 mt-0.5">
                                    {tenantInfo?.document && <span>CNPJ/CPF: {tenantInfo.document}</span>}
                                    {tenantInfo?.phone && <span className="font-semibold">Tel: {tenantInfo.phone}</span>}
                                    {tenantInfo?.email && <span>E-mail: {tenantInfo.email}</span>}
                                    {tenantInfo?.website && <span>Site: {tenantInfo.website}</span>}
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="text-right shrink-0">
                        <div className="border-2 border-slate-800 px-5 py-2 rounded-lg bg-slate-50 min-w-[170px]">
                            <div className="text-[8px] font-semibold text-[#1c2d4f] uppercase tracking-wider mb-0.5 leading-tight">
                                Recibo de Faturamento / Voucher
                                <div className="text-[7px] font-medium text-slate-500 tracking-widest mt-0.5">
                                    Documento Consolidado
                                </div>
                            </div>
                            <div className="text-base font-semibold text-slate-900 tracking-tight whitespace-nowrap mt-1">{invoice.display_id}</div>
                        </div>
                        <div className="text-[8px] font-medium text-slate-400 mt-2 uppercase tracking-wide">
                            Emissão: {new Date(invoice.created_at || Date.now()).toLocaleDateString('pt-BR')} às {new Date(invoice.created_at || Date.now()).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                    </div>
                </div>

                <div className="space-y-3">
                    {/* Dados Completos do Cliente e Faturamento (Padrão de Mercado) */}
                    <div className="border border-slate-300 rounded-lg overflow-hidden break-inside-avoid">
                        <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-300 font-medium text-[9px] uppercase tracking-wider text-slate-700 flex justify-between items-center">
                            <span>Dados Completos do Cliente e Faturamento</span>
                            <span className="text-[8px] font-bold text-slate-500 uppercase">Voucher ID: {invoice.id.slice(0, 8)}</span>
                        </div>
                        <div className="grid grid-cols-12 divide-x divide-slate-200">
                            {/* Coluna Cliente */}
                            <div className="col-span-7 p-2.5 space-y-2">
                                <div>
                                    <label className="block text-[8px] font-medium text-slate-400 uppercase">Cliente / Razão Social</label>
                                    <div className="font-medium text-slate-900 text-sm uppercase">{invoice.customer_name || 'Cliente Não Identificado'}</div>
                                </div>
                                <div>
                                    <label className="block text-[8px] font-medium text-slate-400 uppercase">Endereço Completo</label>
                                    <div className="font-medium text-slate-700 text-xs uppercase">{customerAddress}</div>
                                </div>
                                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100">
                                    <div>
                                        <label className="block text-[8px] font-medium text-slate-400 uppercase">CPF / CNPJ</label>
                                        <div className="font-medium text-slate-700 text-xs font-mono">{doc}</div>
                                    </div>
                                    {phone && (
                                        <div>
                                            <label className="block text-[8px] font-medium text-slate-400 uppercase">Telefone / Contato</label>
                                            <div className="font-medium text-slate-700 text-xs">{phone}</div>
                                        </div>
                                    )}
                                    {email && (
                                        <div className="col-span-2">
                                            <label className="block text-[8px] font-medium text-slate-400 uppercase">E-mail Cadastrado</label>
                                            <div className="font-medium text-slate-700 text-xs truncate">{email}</div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Coluna Faturamento & Gateway */}
                            <div className="col-span-5 p-2.5 grid grid-cols-2 gap-2.5 bg-slate-50/40">
                                <div>
                                    <label className="block text-[8px] font-medium text-slate-400 uppercase">Natureza Ref.</label>
                                    <div className="font-medium uppercase text-slate-800">Fatura Consolidada</div>
                                </div>
                                <div>
                                    <label className="block text-[8px] font-medium text-slate-400 uppercase">Data Emissão</label>
                                    <div className="font-medium uppercase text-slate-800">{new Date(invoice.created_at).toLocaleDateString('pt-BR')}</div>
                                </div>
                                <div>
                                    <label className="block text-[8px] font-medium text-slate-400 uppercase">Status do Faturamento</label>
                                    <div className={`font-medium text-[9px] border px-1.5 py-0.5 rounded inline-block uppercase mt-0.5 ${isPaid ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                                        {isPaid ? 'LIQUIDADO' : 'PENDENTE'}
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-[8px] font-medium text-slate-400 uppercase">Forma de Pagamento</label>
                                    <div className="font-medium uppercase text-slate-800">{invoice.payment_method || 'Mercado Pago'}</div>
                                </div>
                                {invoice.payment_gateway_id && (
                                    <div className="col-span-2 pt-1 border-t border-slate-200">
                                        <label className="block text-[8px] font-medium text-slate-400 uppercase">NSU / ID Gateway Transacional</label>
                                        <div className="font-mono text-[10px] font-bold text-slate-700">{invoice.payment_gateway_id}</div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Descritivo Completo dos Lançamentos da Fatura */}
                    <div className="border border-slate-300 rounded-lg overflow-hidden">
                        <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-300 font-medium text-[9px] uppercase tracking-wider text-slate-700 flex justify-between items-center">
                            <span>Descritivo dos Lançamentos da Fatura</span>
                            <span className="text-[8px] font-bold text-slate-500 uppercase">{billedItems.length} Lançamentos Incluídos</span>
                        </div>
                        <table className="w-full text-left table-fixed">
                            <thead>
                                <tr className="bg-slate-50 text-[8px] font-semibold text-slate-500 uppercase border-b border-slate-200">
                                    <th className="px-3 py-2 w-8">#</th>
                                    <th className="px-3 py-2 w-28">Ref. Documento</th>
                                    <th className="px-3 py-2">Descrição Detalhada do Serviço / Produto</th>
                                    <th className="px-3 py-2 text-center w-16">Tipo</th>
                                    <th className="px-3 py-2 text-right w-24">V. Nominal</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 bg-white">
                                {billedItems.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="px-3 py-4 text-center text-slate-400 text-xs">Nenhum item discriminado na fatura.</td>
                                    </tr>
                                ) : (
                                    billedItems.map((item, index) => (
                                        <tr key={index} className="break-inside-avoid">
                                            <td className="px-3 py-2 text-[10px] font-medium text-slate-400 align-top">
                                                {String(index + 1).padStart(2, '0')}
                                            </td>
                                            <td className="px-3 py-2 text-[10px] font-bold font-mono text-slate-700 align-top">
                                                {item.docLabel}
                                            </td>
                                            <td className="px-3 py-2 text-[10px] uppercase font-medium text-slate-800 break-words whitespace-pre-wrap align-top">
                                                {item.title}
                                            </td>
                                            <td className="px-3 py-2 text-[10px] text-center font-medium text-slate-600 align-top">
                                                {item.typeLabel}
                                            </td>
                                            <td className="px-3 py-2 text-[10px] text-right font-semibold text-slate-900 font-mono align-top">
                                                {formatCurrency(item.amount)}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                        
                        {/* Composição Financeira & Totais */}
                        <div className="bg-slate-50 border-t border-slate-200 divide-y divide-slate-100">
                            <div className="px-6 py-2 flex justify-end gap-12 items-center">
                                <span className="text-[8px] uppercase font-medium tracking-widest text-slate-400">Subtotal dos Lançamentos</span>
                                <span className="text-[10px] font-medium text-slate-600 font-mono">{formatCurrency(subtotal)}</span>
                            </div>
                            {discount > 0 && (
                                <div className="px-6 py-2 flex justify-end gap-12 items-center">
                                    <span className="text-[8px] uppercase font-medium tracking-widest text-rose-400 italic">Desconto Aplicado</span>
                                    <span className="text-[10px] font-medium text-rose-500 font-mono italic">- {formatCurrency(discount)}</span>
                                </div>
                            )}
                            {shipping > 0 && (
                                <div className="px-6 py-2 flex justify-end gap-12 items-center">
                                    <span className="text-[8px] uppercase font-medium tracking-widest text-slate-400">Frete / Deslocamento</span>
                                    <span className="text-[10px] font-medium text-slate-700 font-mono">+ {formatCurrency(shipping)}</span>
                                </div>
                            )}
                            {additions > 0 && (
                                <div className="px-6 py-2 flex justify-end gap-12 items-center">
                                    <span className="text-[8px] uppercase font-medium tracking-widest text-slate-400">Outros Acréscimos</span>
                                    <span className="text-[10px] font-medium text-slate-700 font-mono">+ {formatCurrency(additions)}</span>
                                </div>
                            )}
                            <div className="bg-slate-800 text-white px-6 py-3 flex justify-end gap-12 items-center">
                                <span className="text-[10px] uppercase font-semibold tracking-[0.2em] text-slate-300">Valor Total Líquido do Voucher</span>
                                <span className="text-xl font-semibold tracking-tighter font-mono">{formatCurrency(totalLiquid)}</span>
                            </div>
                        </div>
                    </div>

                    {/* Declaração de Quitação & Autenticidade Padrão de Mercado */}
                    <div className="border border-slate-300 rounded-lg p-3 bg-slate-50/60 break-inside-avoid">
                        <div className="flex items-start gap-2">
                            <ShieldCheck size={14} className="text-slate-500 shrink-0 mt-0.5" />
                            <p className="text-[8px] text-slate-500 leading-relaxed font-medium">
                                Atestamos para os devidos fins que os lançamentos listados neste comprovante de faturamento representam serviços prestados e/ou ordens aprovadas de acordo com as especificações pactuadas entre as partes. {isPaid ? 'Este documento possui validade de quitação para o valor total indicado.' : 'O recibo definitivo de quitação será emitido após a liquidação do valor pelo gateway transacional.'}
                            </p>
                        </div>
                    </div>

                    {/* Autenticação e Assinaturas */}
                    <div className="border border-slate-300 rounded-lg overflow-hidden break-inside-avoid mt-2">
                        <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-300 font-medium text-[9px] uppercase tracking-wider text-slate-700">Autenticação e Assinaturas</div>
                        <div className="grid grid-cols-2 divide-x divide-slate-300 bg-white text-center">
                            <div className="p-4 flex flex-col items-center justify-center gap-3">
                                <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-widest">Emitente / Responsável</p>
                                <div className="h-[60px] flex items-center justify-center text-slate-300 italic text-[10px] font-medium uppercase">
                                    Visto Eletrônico Nexus
                                </div>
                                <div className="w-full border-t border-slate-300 pt-2">
                                    <p className="text-[12px] font-semibold text-slate-900 uppercase">{tenantInfo?.name || 'Assinatura Oficial'}</p>
                                    <p className="text-[9px] font-medium text-slate-500 uppercase tracking-widest mt-0.5">Emissão Eletrônica</p>
                                </div>
                            </div>
                            <div className="p-4 flex flex-col items-center justify-center gap-3">
                                <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-widest">De Acordo / Assinatura do Cliente</p>
                                <div className="h-[60px] flex items-center justify-center">
                                    {isPaid ? (
                                        <span className="text-emerald-500 italic text-[10px] font-bold uppercase flex items-center gap-1">
                                            <CheckCircle2 size={12} /> Liquidado Eletronicamente
                                        </span>
                                    ) : (
                                        <span className="text-slate-200 italic text-[10px] font-medium uppercase">—</span>
                                    )}
                                </div>
                                <div className="w-full border-t border-slate-300 pt-2">
                                    <p className="text-[12px] font-semibold text-slate-900 uppercase">{invoice.customer_name || 'Cliente'}</p>
                                    <p className="text-[9px] font-medium text-slate-500 uppercase tracking-widest mt-0.5">{doc ? `Doc: ${doc}` : ''}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer Minimalista SaaS */}
                <div className="mt-8 pt-4 border-t-2 border-slate-800 flex justify-between items-center text-slate-500 text-[7px] uppercase tracking-tight">
                    <span>NEXUS PRO • SISTEMA CENTRAL DE REQUISITOS</span>
                    <span>Recibo de faturamento emitido eletronicamente. Auditável na plataforma central.</span>
                </div>
            </div>
        </div>
    );
};
