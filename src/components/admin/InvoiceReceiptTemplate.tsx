import React from 'react';
import { Wallet, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { formatInvoiceDisplayId } from '../../utils/invoiceUtils';

const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
};

const formatAsaasDateTime = (dateVal: any): string => {
    if (!dateVal) return '';
    const str = String(dateVal).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
        const [y, m, d] = str.split('-');
        return `${d}/${m}/${y}`;
    }
    if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(str) && !str.includes('Z') && !str.includes('+')) {
        const cleanStr = str.replace(' ', 'T');
        const [datePart, timePart] = cleanStr.split('T');
        const [y, m, d] = datePart.split('-');
        const timeSub = timePart.substring(0, 5);
        return `${d}/${m}/${y} às ${timeSub}`;
    }
    const parsed = new Date(str);
    if (!isNaN(parsed.getTime())) {
        if (parsed.getUTCHours() === 0 && parsed.getUTCMinutes() === 0 && parsed.getUTCSeconds() === 0) {
            const y = parsed.getUTCFullYear();
            const m = String(parsed.getUTCMonth() + 1).padStart(2, '0');
            const d = String(parsed.getUTCDate()).padStart(2, '0');
            return `${d}/${m}/${y}`;
        }
        return parsed.toLocaleString('pt-BR');
    }
    return str;
};

export interface InvoiceReceiptProps {
    invoice: any;
    invoiceItems: any[];
    rawItems: any[];
    customers?: any[];
    installments?: any[];
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
    installments = [],
    tenantInfo 
}) => {
    if (!invoice) return null;

    const installmentsList = (installments && installments.length > 0) ? installments : (invoice.installments || []);

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
                docLabel: formatInvoiceDisplayId(invoice.display_id || (idx + 1)),
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

    const rawAsaasId = invoice.gateway_payment_id || invoice.payment_gateway_id;
    const friendlyInvoiceNum = invoice.invoice_number || invoice.asaas_invoice_number || (invoice.notes ? (invoice.notes.match(/fatura[^\d]*(\d+)/i)?.[1]) : null);
    const paidAtRaw = invoice.paid_at || (installmentsList.find((i: any) => i.paid_at)?.paid_at) || (isPaid ? invoice.updated_at : null);
    const paidAtFormatted = paidAtRaw ? formatAsaasDateTime(paidAtRaw) : null;
    const billedUser = invoice.billed_by_name || invoice.created_by_name || invoice.created_by || invoice.form_data?.billed_by || invoice.notes?.billed_by || (typeof invoice.notes === 'string' && invoice.notes.includes('Faturado por:') ? invoice.notes.split('Faturado por:')[1]?.trim() : null) || 'Sistema / Painel';

    const getFormattedPaymentMethod = () => {
        const m = String(invoice.payment_method || invoice.paymentMethod || '').toLowerCase();
        const count = installmentsList.length;

        let base = 'Pix';
        if (m.includes('credit_card') || m.includes('cart') || m.includes('card')) base = 'Cartão de Crédito';
        else if (m.includes('ticket') || m.includes('boleto')) base = 'Boleto Bancário';
        else if (m.includes('cash') || m.includes('dinheiro')) base = 'Dinheiro';
        else if (m.includes('pix')) base = 'Pix';
        else if (invoice.payment_method) base = invoice.payment_method;

        if (count > 1) return `${base} (${count}x Parcelado)`;
        if (count === 1) return `${base} (À Vista - 1x)`;
        return `${base} (À Vista)`;
    };

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
                    {/* Dados Completos do Cliente e Faturamento (Padrão Gateway Asaas) */}
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

                            {/* Coluna Faturamento & Gateway ASAAS */}
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
                                    <div className={`font-bold text-[9px] border px-1.5 py-0.5 rounded inline-block uppercase mt-0.5 ${isPaid ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                                        {isPaid ? 'LIQUIDADO / PAGO' : 'PENDENTE DE PAGAMENTO'}
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-[8px] font-medium text-slate-400 uppercase">Forma de Pagamento</label>
                                    <div className="font-extrabold uppercase text-slate-900">{getFormattedPaymentMethod()}</div>
                                </div>

                                <div className="col-span-2 pt-1 border-t border-slate-200">
                                    <label className="block text-[8px] font-medium text-slate-400 uppercase">Faturado Por (Operador do Painel)</label>
                                    <div className="font-mono text-[10px] font-bold text-slate-800 uppercase">{billedUser}</div>
                                </div>

                                {paidAtFormatted && (
                                    <div className="col-span-2 pt-1 border-t border-slate-200">
                                        <label className="block text-[8px] font-medium text-slate-400 uppercase">Data da Quitação / Liquidação</label>
                                        <div className="font-mono text-[10px] font-bold text-emerald-700">{paidAtFormatted}</div>
                                    </div>
                                )}

                                {rawAsaasId && (
                                    <div className="col-span-2 pt-1 border-t border-slate-200">
                                        <label className="block text-[8px] font-medium text-slate-400 uppercase">ID Transação ASAAS (Gateway)</label>
                                        <div className="font-mono text-[10px] font-bold text-[#009EE3]">#{rawAsaasId}</div>
                                    </div>
                                )}

                                {friendlyInvoiceNum && (
                                    <div className="col-span-2 pt-1 border-t border-slate-200">
                                        <label className="block text-[8px] font-medium text-slate-400 uppercase">Nº Fatura Asaas</label>
                                        <div className="font-mono text-[10px] font-bold text-slate-800">{friendlyInvoiceNum}</div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Descritivo dos Lançamentos / Composição da Fatura */}
                    {billedItems.length > 0 && (
                        <div className="border border-slate-300 rounded-lg overflow-hidden break-inside-avoid">
                            <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-300 font-medium text-[9px] uppercase tracking-wider text-slate-700 flex justify-between items-center">
                                <span>Descritivo dos Lançamentos / Composição da Fatura</span>
                                <span className="text-[8px] font-bold text-slate-500 uppercase">{billedItems.length} Item(ns)</span>
                            </div>
                            <table className="w-full text-left table-fixed">
                                <thead>
                                    <tr className="bg-slate-50 text-[8px] font-semibold text-slate-500 uppercase border-b border-slate-200">
                                        <th className="px-3 py-1.5 w-10">#</th>
                                        <th className="px-3 py-1.5">Descrição do Lançamento</th>
                                        <th className="px-3 py-1.5 text-center w-24">Doc. Ref.</th>
                                        <th className="px-3 py-1.5 text-center w-20">Tipo</th>
                                        <th className="px-3 py-1.5 text-right w-28">Valor Unit. / Subtotal</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200 bg-white">
                                    {billedItems.map((item: any, idx: number) => (
                                        <tr key={idx} className="break-inside-avoid">
                                            <td className="px-3 py-1.5 text-[9px] font-medium text-slate-400 align-top">
                                                {String(idx + 1).padStart(2, '0')}
                                            </td>
                                            <td className="px-3 py-1.5 text-[9px] uppercase font-semibold text-slate-800 break-words whitespace-pre-wrap align-top">
                                                {item.title}
                                            </td>
                                            <td className="px-3 py-1.5 text-[9px] text-center font-mono font-medium text-slate-600 align-top">
                                                {item.docLabel}
                                            </td>
                                            <td className="px-3 py-1.5 text-[9px] text-center font-bold text-slate-500 align-top">
                                                {item.typeLabel}
                                            </td>
                                            <td className="px-3 py-1.5 text-[9px] text-right font-bold font-mono text-slate-900 align-top">
                                                {formatCurrency(item.amount)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {/* Resumo Financeiro da Fatura */}
                            <div className="bg-slate-50 border-t border-slate-200 divide-y divide-slate-100 text-[9px]">
                                <div className="px-4 py-1.5 flex justify-end gap-8 items-center">
                                    <span className="text-[8px] uppercase font-medium tracking-wider text-slate-500">Subtotal dos Itens:</span>
                                    <span className="font-bold text-slate-800 font-mono">{formatCurrency(subtotal)}</span>
                                </div>
                                {discount > 0 && (
                                    <div className="px-4 py-1.5 flex justify-end gap-8 items-center">
                                        <span className="text-[8px] uppercase font-medium tracking-wider text-rose-500">Desconto Aplicado:</span>
                                        <span className="font-bold text-rose-600 font-mono">- {formatCurrency(discount)}</span>
                                    </div>
                                )}
                                {shipping > 0 && (
                                    <div className="px-4 py-1.5 flex justify-end gap-8 items-center">
                                        <span className="text-[8px] uppercase font-medium tracking-wider text-slate-600">Frete:</span>
                                        <span className="font-bold text-slate-800 font-mono">+ {formatCurrency(shipping)}</span>
                                    </div>
                                )}
                                {additions > 0 && (
                                    <div className="px-4 py-1.5 flex justify-end gap-8 items-center">
                                        <span className="text-[8px] uppercase font-medium tracking-wider text-slate-600">Outros Acréscimos:</span>
                                        <span className="font-bold text-slate-800 font-mono">+ {formatCurrency(additions)}</span>
                                    </div>
                                )}
                                <div className="bg-slate-900 text-white px-4 py-2 flex justify-end gap-8 items-center">
                                    <span className="text-[9px] uppercase font-bold tracking-widest text-slate-300">Valor Total Líquido do Faturamento:</span>
                                    <span className="text-sm font-extrabold font-mono text-emerald-400">{formatCurrency(totalLiquid)}</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Tabela de Pagamento & Datas de Liquidação */}
                    <div className="border border-slate-300 rounded-lg overflow-hidden break-inside-avoid">
                        <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-300 font-medium text-[9px] uppercase tracking-wider text-slate-700 flex justify-between items-center">
                            <span>Tabela de Pagamento & Datas de Liquidação</span>
                            <span className="text-[8px] font-bold text-slate-500 uppercase">
                                {installmentsList.length > 0 ? `${installmentsList.length} Parcela(s)` : 'Pagamento Único / À Vista'}
                            </span>
                        </div>
                        <table className="w-full text-left table-fixed">
                            <thead>
                                <tr className="bg-slate-50 text-[8px] font-semibold text-slate-500 uppercase border-b border-slate-200">
                                    <th className="px-3 py-1.5 w-24">Parcela</th>
                                    <th className="px-3 py-1.5 w-32">Forma de Pagamento</th>
                                    <th className="px-3 py-1.5 w-24">Vencimento</th>
                                    <th className="px-3 py-1.5 text-right w-24">Valor</th>
                                    <th className="px-3 py-1.5 text-center w-28">Status</th>
                                    <th className="px-3 py-1.5 text-right">Data de Pagamento (Pago em)</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 bg-white">
                                {installmentsList.length > 0 ? (
                                    installmentsList.map((inst: any, idx: number) => {
                                        const instPaid = inst.status === 'PAID' || inst.status === 'RECEIVED' || inst.status === 'CONFIRMED' || inst.status === 'ANTICIPATED';
                                        const rawPaidAt = inst.paid_at || (instPaid ? inst.updated_at : null);
                                        const paidDate = instPaid ? (formatAsaasDateTime(rawPaidAt) || 'Liquidado') : '-';
                                        const instMethod = (() => {
                                            const m = String(inst.payment_method || invoice.payment_method || '').toLowerCase();
                                            if (m.includes('credit_card') || m.includes('cart') || m.includes('card')) return 'Cartão de Crédito';
                                            if (m.includes('pix')) return 'PIX';
                                            return 'Boleto Bancário';
                                        })();

                                        return (
                                            <tr key={idx} className="break-inside-avoid">
                                                <td className="px-3 py-1.5 text-[9px] font-bold font-mono text-slate-800">
                                                    Parcela {inst.installment_number || idx + 1} de {inst.total_installments || installmentsList.length}
                                                </td>
                                                <td className="px-3 py-1.5 text-[9px] text-slate-700">
                                                    {instMethod}
                                                </td>
                                                <td className="px-3 py-1.5 text-[9px] font-mono text-slate-700">
                                                    {inst.due_date ? new Date((inst.due_date) + 'T12:00:00').toLocaleDateString('pt-BR') : '-'}
                                                </td>
                                                <td className="px-3 py-1.5 text-[9px] font-bold font-mono text-right text-slate-900">
                                                    {formatCurrency(inst.amount)}
                                                </td>
                                                <td className="px-3 py-1.5 text-[9px] text-center font-bold">
                                                    <span className={`px-2 py-0.5 rounded text-[8px] ${instPaid ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-amber-100 text-amber-800 border border-amber-300'}`}>
                                                        {instPaid ? 'LIQUIDADO' : 'PENDENTE'}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-1.5 text-[9px] text-right font-mono font-bold text-slate-700">
                                                    {paidDate}
                                                </td>
                                            </tr>
                                        );
                                    })
                                ) : (
                                    <tr className="break-inside-avoid">
                                        <td className="px-3 py-1.5 text-[9px] font-bold font-mono text-slate-800">
                                            Parcela 1 de 1
                                        </td>
                                        <td className="px-3 py-1.5 text-[9px] text-slate-700 font-semibold">
                                            {getFormattedPaymentMethod()}
                                        </td>
                                        <td className="px-3 py-1.5 text-[9px] font-mono text-slate-700">
                                            {invoice.created_at ? new Date(invoice.created_at).toLocaleDateString('pt-BR') : '-'}
                                        </td>
                                        <td className="px-3 py-1.5 text-[9px] font-bold font-mono text-right text-slate-900">
                                            {formatCurrency(totalLiquid)}
                                        </td>
                                        <td className="px-3 py-1.5 text-[9px] text-center font-bold">
                                            <span className={`px-2 py-0.5 rounded text-[8px] ${isPaid ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-amber-100 text-amber-800 border border-amber-300'}`}>
                                                {isPaid ? 'LIQUIDADO' : 'PENDENTE'}
                                            </span>
                                        </td>
                                        <td className="px-3 py-1.5 text-[9px] text-right font-mono font-bold text-emerald-700">
                                            {paidAtFormatted || (isPaid ? 'Liquidado' : '-')}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Seção de Autenticação e Assinaturas da Empresa e do Cliente */}
                    <div className="border border-slate-300 rounded-lg overflow-hidden break-inside-avoid mt-2">
                        <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-300 font-medium text-[9px] uppercase tracking-wider text-slate-700 flex justify-between items-center">
                            <span>Autenticação e Assinaturas</span>
                            <span className="text-[8px] font-bold text-slate-500 uppercase">Aceite e Conformidade</span>
                        </div>
                        <div className="grid grid-cols-2 divide-x divide-slate-300 bg-white p-4">
                            {/* Assinatura da Empresa */}
                            <div className="px-4 flex flex-col items-center justify-between min-h-[85px] text-center">
                                <div className="w-full text-[8px] font-semibold text-slate-400 uppercase tracking-widest text-left">
                                    Empresa / Emitente
                                </div>
                                <div className="w-4/5 border-b-2 border-slate-400 my-3"></div>
                                <div className="w-full">
                                    <p className="text-[10px] font-bold text-slate-900 uppercase">
                                        {tenantInfo?.name || 'Assinatura da Empresa / Responsável'}
                                    </p>
                                    <p className="text-[8px] text-slate-500 uppercase font-mono mt-0.5">
                                        {tenantInfo?.document ? `CNPJ/CPF: ${tenantInfo.document}` : 'Empresa Emitente'}
                                    </p>
                                    <p className="text-[8px] text-sky-800 font-semibold uppercase mt-0.5">
                                        Operador: {billedUser}
                                    </p>
                                </div>
                            </div>

                            {/* Assinatura do Cliente */}
                            <div className="px-4 flex flex-col items-center justify-between min-h-[85px] text-center">
                                <div className="w-full text-[8px] font-semibold text-slate-400 uppercase tracking-widest text-left">
                                    Cliente / Tomador do Serviço
                                </div>
                                <div className="w-4/5 border-b-2 border-slate-400 my-3"></div>
                                <div className="w-full">
                                    <p className="text-[10px] font-bold text-slate-900 uppercase">
                                        {invoice.customer_name || 'Assinatura do Cliente / Contratante'}
                                    </p>
                                    <p className="text-[8px] text-slate-500 uppercase font-mono mt-0.5">
                                        {doc !== 'Não informado' ? `CPF/CNPJ: ${doc}` : 'Contratante / Cliente'}
                                    </p>
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
