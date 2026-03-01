import re

with open("src/components/public/PublicOrderView.tsx", "r", encoding="utf-8") as f:
    text = f.read()

pattern = re.compile(
    r'(// ── PRINT LAYOUT \(Enhanced & Complete\).*?// ── WEB LAYOUT ─────────────────────────────────────────────────────────────\s+)(return \(\n    <div className="min-h-screen bg-\[#F0F2F5\])',
    re.DOTALL
)

print_layout = """// ── PRINT LAYOUT ─────────────────────────────────────────────────────────────
  const formItemsPrint: Array<{key: string, text: string | null, photos: string[]}> = [];
  let formDataPrint: Record<string, any> = {};
  if (hasForm) {
    formDataPrint = typeof order.formData === 'string' 
      ? (() => { try { return JSON.parse(order.formData); } catch { return {}; } })() 
      : (order.formData || {});
      
    const SYSTEM_KEYS = new Set([
      'signature', 'signatureName', 'signatureDoc', 'signatureBirth',
      'timeline', 'checkinLocation', 'checkoutLocation', 'pauseReason',
      'impediment_reason', 'impediment_photos', 'totalValue', 'price',
      'finishedAt', 'completedAt', 'technical_report', 'parts_used',
      'clientName', 'customerName', 'customerAddress', 'tenantId',
      'assignedTo', 'formId', 'billingStatus', 'paymentMethod'
    ]);

    const isSignatureKey = (k: string) =>
      k.toLowerCase().includes('assinatura') ||
      k.toLowerCase().includes('signature') ||
      k.toLowerCase().includes('cpf') ||
      k.toLowerCase().includes('nascimento');

    const isImageVal = (v: any) =>
      typeof v === 'string' && (v.startsWith('data:image') || v.startsWith('http'));

    Object.entries(formDataPrint)
      .filter(([key]) => !SYSTEM_KEYS.has(key) && !isSignatureKey(key))
      .forEach(([key, val]) => {
        let text: string | null = null;
        let photos: string[] = [];
        if (Array.isArray(val)) {
          const textParts = val.filter((v: any) => typeof v === 'string' && !isImageVal(v));
          photos = val.filter((v: any) => isImageVal(v));
          if (textParts.length > 0) text = textParts.join(', ');
        } else if (isImageVal(val)) {
          photos = [val as string];
        } else if (val !== null && val !== undefined && val !== '') {
          text = String(val);
        }
        if (text !== null || photos.length > 0) formItemsPrint.push({ key, text, photos });
      });
  }

  const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
  const findFd = (token: string) => {
    if (formDataPrint[token] !== undefined) return formDataPrint[token];
    const found = Object.entries(formDataPrint).find(([k]) => normalize(k).includes(normalize(token)));
    return found ? found[1] : null;
  };

  const clientSigPrint = (order as any).signature || formDataPrint.signature || findFd('assinaturadocliente') || findFd('assinatura');
  const clientNamePrint = (order as any).signatureName || formDataPrint.signatureName || findFd('assinaturadoclientenome') || findFd('responsavelpelorecebi') || findFd('responsavel');
  const clientDocPrint = (order as any).signatureDoc || formDataPrint.signatureDoc || findFd('assinaturadoclientecpf') || findFd('cpf');

  // ── PRINT LAYOUT COMPONENT ──
  const PrintLayout = () => (
    <div className="bg-white text-[10px] leading-tight font-sans p-6 print:break-inside-avoid" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
      {/* Print Header */}
      <div className="flex justify-between items-start pb-4 border-b-2 border-slate-800 mb-4">
        <div className="flex gap-4 items-center">
          {companyLogo
            ? <img src={companyLogo} alt="Logo" className="h-16 w-auto object-contain" />
            : <div className="bg-slate-900 p-2 rounded-lg flex items-center justify-center min-w-[60px] min-h-[60px] text-white"><Hexagon size={32} className="text-white fill-white/10" /></div>
          }
          <div className="space-y-1">
            <h1 className="text-xl font-bold text-slate-900 uppercase tracking-tight">{companyName}</h1>
            <div className="text-[9px] text-slate-600 max-w-[400px]">
              {companyAddress && <div>{companyAddress}</div>}
              <div className="flex gap-3 mt-0.5">
                {companyPhone && <span className="font-semibold">Tel: {companyPhone}</span>}
                {companyEmail && <span>Email: {companyEmail}</span>}
              </div>
              {companyDoc && <div className="mt-0.5">CNPJ: {companyDoc}</div>}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="border-2 border-slate-800 px-4 py-2 rounded-lg bg-slate-50">
            <div className="text-[8px] font-bold text-slate-500 uppercase tracking-wider mb-1">Ordem de Serviço</div>
            <div className="text-2xl font-black text-slate-900 tracking-tighter">#{order.displayId || order.id.slice(0, 8).toUpperCase()}</div>
          </div>
          <div className="text-[8px] font-bold text-slate-400 mt-2 uppercase tracking-wide">
            Emissão: {new Date().toLocaleDateString()} às {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="border border-slate-300 rounded-lg overflow-hidden break-inside-avoid">
          <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-300 font-bold text-[9px] uppercase tracking-wider text-slate-700">Dados do chamado e Cliente</div>
          <div className="grid grid-cols-12 divide-x divide-slate-200">
            <div className="col-span-7 p-2.5 space-y-2">
              <div><label className="block text-[8px] font-bold text-slate-400 uppercase">Cliente</label><div className="font-bold text-slate-900 text-sm uppercase">{order.customerName}</div></div>
              <div><label className="block text-[8px] font-bold text-slate-400 uppercase">Endereço</label><div className="font-medium text-slate-700 text-xs uppercase">{displayAddress || 'N/A'}</div></div>
            </div>
            <div className="col-span-5 p-2.5 grid grid-cols-2 gap-3 bg-slate-50/30">
              <div><label className="block text-[8px] font-bold text-slate-400 uppercase">Abertura</label><div className="font-bold">{fmt(order.createdAt)}</div></div>
              <div><label className="block text-[8px] font-bold text-slate-400 uppercase">Tipo</label><div className="font-bold uppercase">{order.operationType || 'Manutenção'}</div></div>
              <div><label className="block text-[8px] font-bold text-slate-400 uppercase">Status</label><div className="font-bold text-[9px] border border-slate-200 px-1.5 py-0.5 rounded inline-block bg-white uppercase">{order.status}</div></div>
              <div><label className="block text-[8px] font-bold text-slate-400 uppercase">Técnico</label><div className="font-bold uppercase">{tech?.name || 'N/A'}</div></div>
            </div>
          </div>
        </div>

        {(order.equipmentName || order.equipmentModel || order.equipmentSerial) && (
          <div className="border border-slate-300 rounded-lg overflow-hidden break-inside-avoid">
            <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-300 font-bold text-[9px] uppercase tracking-wider text-slate-700">Dados do Equipamento</div>
            <div className="p-3 bg-white grid grid-cols-3 gap-4">
                <div className="col-span-1"><label className="block text-[8px] font-bold text-slate-400 uppercase">Equipamento</label><div className="font-bold text-slate-900 text-xs uppercase">{order.equipmentName || '—'}</div></div>
                <div className="col-span-1"><label className="block text-[8px] font-bold text-slate-400 uppercase">Modelo</label><div className="font-bold text-slate-900 text-xs uppercase">{order.equipmentModel || '—'}</div></div>
                <div className="col-span-1"><label className="block text-[8px] font-bold text-slate-400 uppercase">Nº Sér / ID</label><div className="font-bold text-slate-900 text-xs uppercase font-mono">{order.equipmentSerial || '—'}</div></div>
            </div>
          </div>
        )}

        {order.description && (
            <div className="border border-slate-300 rounded-lg overflow-hidden break-inside-avoid">
              <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-300 font-bold text-[9px] uppercase tracking-wider text-slate-700">Relatório / Descrição do Serviço</div>
              <div className="p-3 bg-white text-[11px] text-slate-800 font-medium whitespace-pre-wrap leading-relaxed">
                {order.description}
              </div>
            </div>
        )}

        {(order.status === 'IMPEDIDO' || formDataPrint.impediment_reason || (order.notes && order.notes.includes('IMPEDIMENTO'))) && (
            <div className="border border-red-300 rounded-lg overflow-hidden break-inside-avoid shadow-sm text-red-900">
              <div className="bg-red-100 px-3 py-1.5 border-b border-red-300 font-bold text-[9px] uppercase tracking-wider text-red-700">Aviso de Impedimento / Pendência</div>
              <div className="p-3 bg-red-50 text-[11px] font-medium whitespace-pre-wrap italic">
                {formDataPrint.impediment_reason || (order.notes ? order.notes.replace('IMPEDIMENTO: ', '') : 'Motivo não mapeado detalhadamente.')}
              </div>
            </div>
        )}

        {order.showValueToClient && order.items && order.items.length > 0 && (
          <div className="border border-slate-300 rounded-lg overflow-hidden break-inside-avoid">
            <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-300 font-bold text-[9px] uppercase tracking-wider text-slate-700">Composição (Peças e Serviços)</div>
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 text-[8px] font-black text-slate-500 uppercase border-b border-slate-200">
                  <th className="px-3 py-2">Descrição do Item</th>
                  <th className="px-3 py-2 text-center w-16">Qtd</th>
                  <th className="px-3 py-2 text-right w-24">V. Unitário</th>
                  <th className="px-3 py-2 text-right w-24">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {order.items.map((it: any, i: number) => (
                  <tr key={i}>
                    <td className="px-3 py-2 text-[10px] uppercase font-bold text-slate-800">{it.description}</td>
                    <td className="px-3 py-2 text-[10px] text-center font-bold text-slate-600">{it.quantity}</td>
                    <td className="px-3 py-2 text-[10px] text-right text-slate-600 font-mono">R$ {it.unitPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                    <td className="px-3 py-2 text-[10px] text-right font-black text-slate-900 font-mono">R$ {it.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="bg-slate-800 text-white px-3 py-2 flex justify-end gap-6 items-center border-t border-slate-800">
                <span className="text-[9px] uppercase font-black tracking-widest text-slate-300">Total</span>
                <span className="text-sm font-black tracking-tighter">R$ {totalItems.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
            </div>
          </div>
        )}

        {formItemsPrint.length > 0 && (
            <div className="border border-slate-300 rounded-lg overflow-hidden break-inside-avoid">
              <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-300 font-bold text-[9px] uppercase tracking-wider text-slate-700">Formulário / Checklist Técnico de Execução</div>
              <div className="divide-y divide-slate-100 bg-white">
                {formItemsPrint.map((item, idx) => (
                  <div key={idx} className="p-3 break-inside-avoid">
                    <p className="text-[8px] font-black uppercase tracking-widest text-slate-500 mb-1">{!isNaN(Number(item.key)) ? `Pergunta ${item.key}` : item.key}</p>
                    {item.text && <p className={`text-[11px] font-bold uppercase leading-snug ${item.text.toLowerCase() === 'sim' || item.text.toLowerCase() === 'ok' ? 'text-emerald-700' : 'text-slate-900'}`}>{item.text}</p>}
                    
                    {item.photos.length > 0 && (
                      <div className="grid grid-cols-4 gap-2 mt-2">
                          {item.photos.map((p, pIdx) => (
                            <div key={pIdx} className="border border-slate-200 rounded p-0.5 max-h-32 overflow-hidden flex items-center justify-center bg-slate-50 break-inside-avoid">
                              <img src={p} className="max-w-full max-h-full object-contain" style={{ maxHeight: '120px' }} alt="Evidência fotográfica" />
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
        )}

        <div className="border border-slate-300 rounded-lg overflow-hidden break-inside-avoid mt-8">
          <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-300 font-bold text-[9px] uppercase tracking-wider text-slate-700">Validação e Assinaturas (Auditoria Digital)</div>
          <div className="grid grid-cols-2 divide-x divide-slate-300 bg-white text-center">
            <div className="p-4 flex flex-col items-center justify-center gap-3">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Responsável Técnico</p>
                <div className="h-[60px] flex items-center justify-center text-slate-200 italic text-[10px] font-bold uppercase">
                  Validação Eletrônica no Sistema
                </div>
                <div className="w-full border-t border-slate-300 pt-2">
                  <p className="text-[12px] font-black text-slate-900 uppercase">{tech?.name || 'Não Atribuído'}</p>
                </div>
            </div>
            <div className="p-4 flex flex-col items-center justify-center gap-3">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Responsável pela Conformidade (Cliente)</p>
                <div className="h-[80px] flex items-center justify-center">
                  {clientSigPrint ? (
                    <img src={clientSigPrint} className="max-h-full max-w-full object-contain mix-blend-multiply" alt="Assinatura" />
                  ) : (
                    <span className="text-slate-300 italic text-[10px] font-bold uppercase">Sem assinatura física registrada</span>
                  )}
                </div>
                <div className="w-full border-t border-slate-300 pt-2">
                  <p className="text-[12px] font-black text-slate-900 uppercase">{clientNamePrint || 'Não Informado'}</p>
                  {clientDocPrint && <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">{clientDocPrint}</p>}
                </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 pt-4 border-t-2 border-slate-800 flex justify-between items-center text-slate-500">
        <div className="flex items-center gap-2">
          <NexusBranding size="lg" className="opacity-80 origin-left scale-75" />
        </div>
        <div className="text-right">
            <p className="text-[8px] font-bold uppercase tracking-widest text-[#1c2d4f]">Nexus Line • Commercial Intelligence</p>
            <p className="text-[7px] uppercase tracking-tight mt-0.5">Documento emitido eletronicamente. Auditável na plataforma central.</p>
        </div>
      </div>
    </div>
  );

  if (isPrint) return <PrintLayout />;

  // ── WEB LAYOUT ─────────────────────────────────────────────────────────────
  return (
    <>
      <div className="hidden print:block">
        <PrintLayout />
      </div>
      <div className="min-h-screen bg-[#F0F2F5] font-sans selection:bg-[#1c2d4f]/10 print:hidden">"""

new_text = pattern.sub(print_layout + r'\2', text)
with open("src/components/public/PublicOrderView.tsx", "w", encoding="utf-8") as f:
    f.write(new_text)

print("done")
