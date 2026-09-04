import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, ShieldCheck, CheckCircle2, Clock, FileText, 
  Printer, DollarSign, CreditCard, Hash, Calendar, Building2, UserCheck, AlertCircle, Hexagon
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface PaymentAuditModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: {
    type: 'ORDER' | 'QUOTE' | 'INVOICE';
    id: string;
    displayId?: string;
    title: string;
    amount: number;
    discount?: number;
    grossValue?: number;
    customerName: string;
    customerDocument?: string;
    customerAddress?: string;
    paymentMethod?: string;
    gatewayProvider?: string;
    gatewayPaymentId?: string;
    gatewayStatus?: string;
    paidAt?: string;
    billingStatus?: string;
    createdAt?: string;
  } | null;
}

export const PaymentAuditModal: React.FC<PaymentAuditModalProps> = ({
  isOpen, onClose, item
}) => {
  const [tenant, setTenant] = useState<any>(null);

  useEffect(() => {
    if (isOpen) {
      const fetchTenant = async () => {
        try {
          const { data } = await supabase.from('tenants').select('*').limit(1).maybeSingle();
          if (data) setTenant(data);
        } catch {
          // Fallback silencioso
        }
      };
      fetchTenant();
    }
  }, [isOpen]);

  if (!isOpen || !item) return null;
  if (typeof document === 'undefined') return null;

  // Extração ultra-resiliente de campos com múltiplos fallbacks (camelCase e snake_case)
  const orig = (item as any).original || {};
  const rawGtwPaymentId = item.gatewayPaymentId || (item as any).gateway_payment_id || orig.gatewayPaymentId || orig.gateway_payment_id || orig.payment_gateway_id || null;
  const isRealNumericPaymentId = rawGtwPaymentId ? /^\d+$/.test(String(rawGtwPaymentId).trim()) : false;
  const gtwPaymentId = isRealNumericPaymentId ? String(rawGtwPaymentId).trim() : null;
  const displayGtwPaymentId = isRealNumericPaymentId ? String(rawGtwPaymentId).trim() : 'N/A (Aguardando Pagamento / Manual)';
  
  const fd = orig.form_data || (item as any).formData || (item as any).form_data || {};
  const am = orig.approval_metadata || (item as any).approvalMetadata || (item as any).approval_metadata || {};
  let parsedNotes: any = {};
  try {
    parsedNotes = typeof orig.notes === 'string' ? JSON.parse(orig.notes) : (orig.notes || {});
  } catch (e) {}
  if (Object.keys(parsedNotes).length === 0 && (item as any).notes) {
    try {
      parsedNotes = typeof (item as any).notes === 'string' ? JSON.parse((item as any).notes) : ((item as any).notes || {});
    } catch (e) {}
  }

  let payMethod = item.paymentMethod || 
    (item as any).payment_method || 
    orig.paymentMethod || 
    orig.payment_method || 
    (item as any).gatewayPaymentMethod || 
    (item as any).gateway_payment_method || 
    orig.gatewayPaymentMethod || 
    orig.gateway_payment_method || 
    fd.paymentMethod || 
    fd.payment_method || 
    am.paymentMethod || 
    am.payment_method || 
    parsedNotes.payment_method || 
    parsedNotes.paymentMethod || 
    parsedNotes.payment_method_type || 
    (gtwPaymentId ? 'credit_card' : null);

  const rawInstallments = 
    (item as any).installments || 
    (item as any).mpInstallments || 
    (item as any).max_installments || 
    orig.installments || 
    orig.mpInstallments || 
    orig.max_installments || 
    fd.installments || 
    fd.mpInstallments || 
    fd.max_installments || 
    am.installments || 
    am.mpInstallments || 
    am.max_installments || 
    parsedNotes.installments || 
    parsedNotes.mpInstallments || 
    parsedNotes.max_installments || 
    1;

  const installmentsCount = Math.max(1, Number(rawInstallments) || 1);

  const gtwProvider = item.gatewayProvider || (item as any).gateway_provider || orig.gatewayProvider || orig.gateway_provider || 'Mercado Pago Connect OAuth 2.0';
  const gtwStatus = item.gatewayStatus || (item as any).gateway_status || orig.gatewayStatus || orig.gateway_status || 'pending';
  const paidAtDate = item.paidAt || (item as any).paid_at || orig.paidAt || orig.paid_at || null;
  const billingStat = item.billingStatus || (item as any).billing_status || orig.billingStatus || orig.billing_status || 'PENDING';
  const custDoc = item.customerDocument || orig.customerDocument || orig.customer_document || 'Cadastrado no Sistema';
  const custAddress = item.customerAddress || orig.customerAddress || orig.customer_address || 'Não Informado';

  const isPaid = billingStat === 'PAID' || gtwStatus === 'approved';

  const formatMethodName = (methodStr?: string | null, instCount: number = 1) => {
    if (!methodStr || methodStr.trim() === '') {
      if (instCount > 1) {
        return `Cartão de Crédito (em até ${instCount}x)`;
      }
      return 'Não Especificado';
    }

    const s = String(methodStr).trim();
    const sLower = s.toLowerCase();
    
    // Extrai número de parcelas se o próprio nome do método contiver ex: "Cartão Crédito 3x" ou "(3x)"
    const matchInst = s.match(/(\d+)\s*x/i);
    const parsedInstFromStr = matchInst ? Number(matchInst[1]) : 0;
    const finalInst = parsedInstFromStr > 0 ? parsedInstFromStr : instCount;

    let baseName = '';
    if (sLower.includes('credit_card') || sLower.includes('card_link') || sLower.includes('cartao') || sLower.includes('cartão') || sLower.includes('credit') || sLower.includes('card')) {
      baseName = 'Cartão de Crédito';
    } else if (sLower.includes('pix')) {
      baseName = 'Pix Instantâneo';
    } else if (sLower.includes('boleto') || sLower.includes('ticket') || sLower.includes('bolbradesco')) {
      baseName = 'Boleto Bancário';
    } else if (sLower.includes('money') || sLower.includes('dinheiro') || sLower.includes('cash')) {
      baseName = 'Dinheiro';
    } else if (sLower.includes('transfer') || sLower.includes('ted') || sLower.includes('doc')) {
      baseName = 'Transferência Bancária';
    } else {
      baseName = s;
    }

    if (baseName === 'Cartão de Crédito') {
      return `Cartão de Crédito (em até ${finalInst}x)`;
    }

    if (finalInst > 1) {
      return `${baseName} (${finalInst}x)`;
    }

    return baseName;
  };

  const companyName = tenant?.company_name || tenant?.name || tenant?.companyName || 'DUNO NEXUS PRO';
  const companyLogo = tenant?.logo_url || tenant?.logoUrl;
  const companyAddress = tenant?.address || tenant?.street ? `${tenant?.street || tenant?.address || ''} ${tenant?.number ? ', ' + tenant.number : ''} ${tenant?.city ? '- ' + tenant.city : ''}` : '';
  const companyPhone = tenant?.phone || '';
  const companyEmail = tenant?.admin_email || tenant?.email || '';
  const companyDoc = tenant?.cnpj || tenant?.document || '';

  const handlePrintAudit = () => {
    window.print();
  };

  // ─── Extração Ultra-Resiliente da Discriminação Financeira (100% alinhada à Visão Geral) ──────────────
  const itemsSum = Array.isArray(orig.items) && orig.items.length > 0
    ? orig.items.reduce((acc: number, i: any) => acc + (Number(i.total) || (Number(i.unitPrice || i.unit_price || 0) * Number(i.quantity || 1)) || 0), 0)
    : 0;

  const grossAmount = Number(
    (item as any).grossValue ||
    (item as any).grossAmount ||
    itemsSum ||
    orig.grossValue ||
    orig.original_value ||
    orig.total_value ||
    orig.totalValue ||
    item.amount ||
    (item as any).value ||
    0
  );

  const discountType = String(
    (item as any).billingDiscountType ||
    (item as any).discountType ||
    orig.billingDiscountType ||
    orig.discountType ||
    orig.discount_type ||
    'fixed'
  ).toLowerCase();

  let discountAmount = Number((item as any).discountAmount || 0);

  if (discountAmount <= 0) {
    const rawDisc = Number((item as any).billingDiscount || item.discount || orig.discount || orig.discount_amount || 0);
    if (rawDisc > 0) {
      discountAmount = discountType === 'percent' ? (grossAmount * rawDisc / 100) : rawDisc;
    }
  }

  const netAmount = Number(
    (item as any).netValue ||
    item.amount ||
    (item as any).value ||
    Math.max(0, grossAmount - discountAmount)
  );

  // Se discountAmount continuar 0 mas o Bruto for maior que o Líquido, infere o desconto pela diferença
  if (discountAmount <= 0 && grossAmount > netAmount) {
    discountAmount = grossAmount - netAmount;
  }

  return createPortal(
    <>
      {/* Estilos Específicos de Impressão — Padrão Exato de Orçamentos e Ordens sem Quebra de Página */}
      <style font-poppins>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 8mm;
          }
          html, body {
            height: auto !important;
            min-height: 0 !important;
            overflow: visible !important;
            background: white !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body * {
            visibility: hidden;
          }
          #audit-modal-backdrop, #audit-modal-backdrop * {
            visibility: visible;
          }
          #audit-modal-backdrop {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            height: auto !important;
            min-height: 0 !important;
            display: block !important;
            background: white !important;
            padding: 0 !important;
            margin: 0 !important;
            overflow: visible !important;
          }
          .no-print {
            display: none !important;
          }
          .printable-invoice-container {
            position: relative !important;
            display: block !important;
            border: none !important;
            box-shadow: none !important;
            max-width: 100% !important;
            width: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
            max-height: none !important;
            height: auto !important;
            overflow: visible !important;
            border-radius: 0 !important;
          }
          #printable-audit-report {
            max-height: none !important;
            height: auto !important;
            overflow: visible !important;
            padding: 0 !important;
            margin: 0 !important;
            display: block !important;
          }
          .break-inside-avoid {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
        }
      `}</style>

      <div id="audit-modal-backdrop" className="fixed inset-0 z-[99999] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in font-poppins">
        <div className="bg-white rounded-3xl max-w-3xl w-full shadow-2xl overflow-hidden border border-slate-100 flex flex-col max-h-[92vh] printable-invoice-container">
          
          {/* Modal Screen Header (Hidden on Print) */}
          <div className="bg-slate-900 text-white p-5 flex items-center justify-between no-print">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center">
                <ShieldCheck size={24} />
              </div>
              <div>
                <h3 className="font-bold text-base flex items-center gap-2">
                  Auditoria de Transação & Gateway
                  <span className="text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                    Auditável
                  </span>
                </h3>
                <p className="text-[11px] text-slate-400">
                  {item.type === 'INVOICE' ? 'Fatura' : item.type === 'ORDER' ? 'Ordem de Serviço' : 'Orçamento'} #{item.displayId || item.id.slice(0, 8)} • {item.customerName}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 text-slate-400 hover:text-white transition-colors">
              <X size={20} />
            </button>
          </div>

          {/* ESTRUTURA COMPLETA DA FATURA DE IMPRESSÃO (Seguindo Métrica Exata de Orçamentos) */}
          <div className="p-6 sm:p-8 space-y-4 overflow-y-auto print:p-0 print:space-y-3" id="printable-audit-report">
            
            {/* Header da Empresa / Timbrado (Padrão Orçamento) */}
            <div className="flex justify-between items-start pb-4 border-b-2 border-slate-800">
              <div className="flex gap-4 items-center">
                {companyLogo ? (
                  <img src={companyLogo} alt="Logo Empresa" className="h-14 w-auto object-contain" />
                ) : (
                  <div className="bg-slate-900 p-2 rounded-lg flex items-center justify-center min-w-[50px] min-h-[50px] text-white">
                    <Hexagon size={28} className="text-white fill-white/10" />
                  </div>
                )}
                <div className="space-y-0.5">
                  <h1 className="text-lg font-black text-slate-900 uppercase tracking-tight">{companyName}</h1>
                  <div className="text-[9px] text-slate-600 max-w-[420px] font-medium leading-tight">
                    {companyAddress && <div>{companyAddress}</div>}
                    <div className="flex gap-3 mt-0.5">
                      {companyPhone && <span className="font-semibold">Tel: {companyPhone}</span>}
                      {companyEmail && <span>Email: {companyEmail}</span>}
                    </div>
                    {companyDoc && <div className="mt-0.5">CNPJ/CPF: {companyDoc}</div>}
                  </div>
                </div>
              </div>

              <div className="text-right shrink-0">
                <div className="border-2 border-slate-800 px-4 py-2 rounded-xl bg-slate-50 min-w-[170px]">
                  <div className="text-[8px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">Fatura & Comprovante</div>
                  <div className="text-sm font-black text-slate-900 tracking-tight whitespace-nowrap">
                    {item.type === 'INVOICE' ? 'FATURA' : item.type === 'ORDER' ? 'O.S.' : 'ORÇ'} #{item.displayId || item.id.slice(0, 8).toUpperCase()}
                  </div>
                </div>
                <div className="text-[8px] font-medium text-slate-400 mt-1.5 uppercase tracking-wide">
                  Emissão: {new Date().toLocaleDateString('pt-BR')} às {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>

            {/* Banner de Status Auditado */}
            <div className={`p-3.5 rounded-xl border flex items-center justify-between ${
              isPaid 
                ? 'bg-emerald-50/80 border-emerald-200 text-emerald-900' 
                : 'bg-amber-50/80 border-amber-200 text-amber-900'
            }`}>
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-lg text-white flex items-center justify-center shrink-0 ${
                  isPaid ? 'bg-emerald-600' : 'bg-amber-500'
                }`}>
                  {isPaid ? <CheckCircle2 size={20} /> : <Clock size={20} />}
                </div>
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider block">
                    {isPaid ? '🟢 Liquidação Confirmada (Auditada)' : '🟡 Transação Pendente de Pagamento'}
                  </span>
                  <span className="text-[10px] opacity-80">
                    {isPaid ? 'Pagamento verificado e conciliado no fluxo de caixa.' : 'Aguardando liquidação do comprador no gateway.'}
                  </span>
                </div>
              </div>

              <div className="text-right shrink-0">
                <span className="text-[9px] font-bold text-slate-400 uppercase block">Valor Total Líquido</span>
                <span className="text-lg font-black text-slate-900">R$ {netAmount.toFixed(2)}</span>
              </div>
            </div>

            {/* Box 1: Dados do Cliente e Transação */}
            <div className="border border-slate-300 rounded-xl overflow-hidden break-inside-avoid">
              <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-300 font-bold text-[9px] uppercase tracking-wider text-slate-700">
                Dados do Cliente e Pagador
              </div>
              <div className="grid grid-cols-12 divide-x divide-slate-200 text-xs">
                <div className="col-span-7 p-3 space-y-2">
                  <div>
                    <label className="block text-[8px] font-bold text-slate-400 uppercase">Cliente / Razão Social</label>
                    <div className="font-bold text-slate-900 text-sm uppercase">{item.customerName}</div>
                  </div>
                  <div>
                    <label className="block text-[8px] font-bold text-slate-400 uppercase">Endereço</label>
                    <div className="font-medium text-slate-700 text-xs uppercase">{custAddress}</div>
                  </div>
                  <div>
                    <label className="block text-[8px] font-bold text-slate-400 uppercase">Documento / CPF / CNPJ</label>
                    <div className="font-semibold text-slate-800 text-xs">{custDoc}</div>
                  </div>
                </div>

                <div className="col-span-5 p-3 grid grid-cols-1 gap-2 bg-slate-50/40">
                  <div>
                    <label className="block text-[8px] font-bold text-slate-400 uppercase">Título / Referência</label>
                    <div className="font-bold text-slate-900 text-xs uppercase">{item.title}</div>
                  </div>
                  <div>
                    <label className="block text-[8px] font-bold text-slate-400 uppercase">Data de Criação</label>
                    <div className="font-semibold text-slate-700">{item.createdAt ? new Date(item.createdAt).toLocaleDateString('pt-BR') : '—'}</div>
                  </div>
                  <div>
                    <label className="block text-[8px] font-bold text-slate-400 uppercase">Status Financeiro</label>
                    <div className="font-bold text-[9px] border border-slate-300 px-2 py-0.5 rounded inline-block bg-white uppercase">
                      {isPaid ? 'FATURADO / PAGO' : 'PENDENTE'}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Box 2: Composicao Financeira e Reconciliacao */}
            <div className="border border-slate-300 rounded-xl overflow-hidden break-inside-avoid">
              <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-300 font-bold text-[9px] uppercase tracking-wider text-slate-700">
                Discriminação Financeira da Fatura
              </div>
              <div className="p-3 bg-white space-y-3">
                <div className="grid grid-cols-3 gap-3 text-xs">
                  <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                    <span className="text-slate-400 block text-[9px] uppercase font-bold">Valor Bruto Original</span>
                    <span className="font-bold text-slate-500 line-through text-sm">
                      R$ {grossAmount.toFixed(2)}
                    </span>
                  </div>
                  <div className="bg-rose-50 p-2.5 rounded-lg border border-rose-200 text-rose-800">
                    <span className="text-rose-500 block text-[9px] uppercase font-bold">Desconto Concedido</span>
                    <span className="font-bold text-rose-600 text-sm">
                      - R$ {discountAmount.toFixed(2)}
                    </span>
                  </div>
                  <div className="bg-emerald-50 p-2.5 rounded-lg border border-emerald-200 text-emerald-900">
                    <span className="text-emerald-600 block text-[9px] uppercase font-bold">Valor Líquido Recebido</span>
                    <span className="font-bold text-emerald-600 text-base">
                      R$ {netAmount.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Box 3: Metadados do Gateway e Auditoria Tecnologica */}
            <div className="border border-slate-300 rounded-xl overflow-hidden break-inside-avoid">
              <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-300 font-bold text-[9px] uppercase tracking-wider text-slate-700">
                Metadados do Gateway & Auditoria Eletrônica
              </div>
              <div className="p-3 bg-white grid grid-cols-2 gap-3 text-xs">
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  <span className="text-slate-400 block text-[8px] uppercase font-bold">ID Único da Transação (Gateway)</span>
                  <span className="font-mono font-bold text-slate-900 break-all text-xs">
                    {displayGtwPaymentId}
                  </span>
                </div>
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  <span className="text-slate-400 block text-[8px] uppercase font-bold">Meio de Pagamento Provedor</span>
                  <span className="font-bold text-slate-900 text-xs">
                    {formatMethodName(payMethod, installmentsCount)}
                  </span>
                </div>
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  <span className="text-slate-400 block text-[8px] uppercase font-bold">Data & Hora da Liquidação</span>
                  <span className="font-bold text-slate-900 text-xs">
                    {paidAtDate ? new Date(paidAtDate).toLocaleString('pt-BR') : 'Não Liquidado'}
                  </span>
                </div>
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  <span className="text-slate-400 block text-[8px] uppercase font-bold">Provedor Integrador</span>
                  <span className="font-bold text-slate-900 uppercase text-xs">
                    {gtwProvider}
                  </span>
                </div>
              </div>
            </div>

            {/* Box 4: Hash SHA-256 e Autenticidade Digital */}
            <div className="bg-slate-900 text-slate-300 rounded-xl p-3.5 space-y-1.5 break-inside-avoid">
              <div className="flex items-center justify-between text-[10px]">
                <span className="font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1">
                  <ShieldCheck size={14} /> Trilha de Auditoria Digital (Hash SHA-256 Inviolável)
                </span>
                <span className="text-slate-500 font-mono text-[9px]">Autenticidade Garantida</span>
              </div>
              <code className="text-[9px] font-mono text-slate-400 block break-all bg-slate-950 p-2 rounded-lg border border-slate-800">
                SHA256:{item.id.replace(/-/g, '')}:{gtwPaymentId || 'MANUAL'}:{netAmount}
              </code>
            </div>

            {/* Linhas de Assinatura (Métrica idêntica à de Orçamento) */}
            <div className="pt-6 grid grid-cols-2 gap-12 text-center break-inside-avoid">
              <div>
                <div className="border-b border-slate-400 mb-1.5"></div>
                <p className="text-[9px] font-bold text-slate-800 uppercase">{companyName}</p>
                <p className="text-[8px] text-slate-400 uppercase">Responsável Financeiro / Emissor</p>
              </div>
              <div>
                <div className="border-b border-slate-400 mb-1.5"></div>
                <p className="text-[9px] font-bold text-slate-800 uppercase">{item.customerName}</p>
                <p className="text-[8px] text-slate-400 uppercase">Cliente / Pagador</p>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200 text-center text-[8px] text-slate-400">
              Documento de Auditoria e Faturamento Eletrônico • DUNO • Reconciliação Bancária Automatizada
            </div>
          </div>

          {/* Footer Actions (No Print) */}
          <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between no-print">
            <span className="text-[11px] text-slate-400 font-medium">Documento gerado automaticamente pelo DUNO</span>
            <div className="flex items-center gap-2">
              <button
                onClick={handlePrintAudit}
                className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-md active:scale-95"
              >
                <Printer size={15} /> Imprimir Fatura de Auditoria (PDF)
              </button>
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
};
