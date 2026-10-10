import XLSX from 'xlsx-js-style';

export interface ExcelExportOptions {
    filename: string;
    sheetName: string;
    headers: string[];
    rows: (string | number | boolean | null | undefined)[][];
    colWidths?: { wch: number }[];
}

export interface FinancialReportPrintOptions {
    title: string;
    subtitle?: string;
    headers: string[];
    rows: (string | number | boolean | null | undefined)[][];
    summaryCards?: { label: string; value: string; color?: string }[];
    tenant?: any;
    userName?: string;
    colAlignments?: ('left' | 'center' | 'right')[];
}

/**
 * Exporta dados para arquivo Excel (.xlsx) aplicando o cabeçalho dark navy (#1C2D4F)
 * e formatações de célula padronizadas do sistema Nexus Pro.
 */
export function exportToExcelWithStyle({
    filename,
    sheetName,
    headers,
    rows,
    colWidths
}: ExcelExportOptions) {
    const headerStyle = {
        font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 },
        fill: { fgColor: { rgb: '1C2D4F' } },
        alignment: { horizontal: 'center', vertical: 'center' },
        border: {
            top: { style: 'thin', color: { rgb: 'FFFFFF' } },
            bottom: { style: 'thin', color: { rgb: 'FFFFFF' } },
            left: { style: 'thin', color: { rgb: 'FFFFFF' } },
            right: { style: 'thin', color: { rgb: 'FFFFFF' } }
        }
    };

    const wsData = [headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    if (colWidths && colWidths.length > 0) {
        ws['!cols'] = colWidths;
    }

    const range = XLSX.utils.decode_range(ws['!ref'] || "A1:A1");

    // Header styling
    for (let C = range.s.c; C <= range.e.c; ++C) {
        const address = XLSX.utils.encode_cell({ r: 0, c: C });
        if (!ws[address]) continue;
        ws[address].s = headerStyle;
    }

    // Body styling
    for (let R = 1; R <= range.e.r; ++R) {
        for (let C = range.s.c; C <= range.e.c; ++C) {
            const address = XLSX.utils.encode_cell({ r: R, c: C });
            if (!ws[address]) continue;
            if (!ws[address].s) ws[address].s = {};
            if (!ws[address].s.font) ws[address].s.font = {};
            ws[address].s.font.sz = 11;
            ws[address].s.alignment = { vertical: 'center' };
        }
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName || "Relatório");
    const validFilename = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
    XLSX.writeFile(wb, validFilename);
}

/**
 * Imprime ou gera PDF do relatório financeiro consolidado usando o layout oficial
 * (#batch-print-root + body.is-printing) com dados da empresa, cabeçalho e tabela estilizada.
 */
export function printFinancialReport({
    title,
    subtitle,
    headers,
    rows,
    summaryCards = [],
    tenant,
    userName,
    colAlignments = []
}: FinancialReportPrintOptions) {
    if (typeof document === 'undefined') return;

    // 1. Remove qualquer elemento de impressão anterior
    const existing = document.getElementById('batch-print-root');
    if (existing) existing.remove();

    // 2. Extrai dados consolidados da empresa
    let companyName = tenant?.company_name || tenant?.trading_name || tenant?.name;
    let companyLogo = tenant?.logo_url || tenant?.logoUrl;
    let companyCnpj = tenant?.cnpj || tenant?.document;
    let companyPhone = tenant?.phone;
    let companyEmail = tenant?.admin_email || tenant?.email;

    if (!companyName) {
        try {
            const raw = JSON.parse(localStorage.getItem('nexus_settings') || '{}');
            const comp = raw.company || {};
            companyName = comp.name || comp.tradingName || 'Nexus Pro';
            companyLogo = companyLogo || comp.logoUrl || comp.logo;
            companyCnpj = companyCnpj || comp.cnpj || comp.document;
            companyPhone = companyPhone || comp.phone;
            companyEmail = companyEmail || comp.email;
        } catch {}
    }

    if (!companyName) companyName = 'Nexus Pro';

    // 3. Monta o container de impressão oficial
    const printEl = document.createElement('div');
    printEl.id = 'batch-print-root';
    printEl.className = 'bg-white font-sans text-slate-800 p-8';

    // Cards de resumo superior
    const cardsHtml = summaryCards.length > 0 ? `
        <div style="display: grid; grid-template-columns: repeat(${Math.min(summaryCards.length, 4)}, 1fr); gap: 12px; margin-bottom: 20px;">
            ${summaryCards.map(c => `
                <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px;">
                    <div style="font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; margin-bottom: 4px;">
                        ${c.label}
                    </div>
                    <div style="font-size: 15px; font-weight: 800; color: ${c.color || '#0f172a'};">
                        ${c.value}
                    </div>
                </div>
            `).join('')}
        </div>
    ` : '';

    // Linhas da tabela
    const tableRowsHtml = rows.length === 0 ? `
        <tr>
            <td colspan="${headers.length}" style="padding: 24px; text-align: center; color: #64748b; font-size: 11px;">
                Nenhum registro selecionado ou encontrado no período.
            </td>
        </tr>
    ` : rows.map((r, idx) => `
        <tr style="background-color: ${idx % 2 === 0 ? '#ffffff' : '#f8fafc'}; border-bottom: 1px solid #e2e8f0;">
            ${r.map((cell, cIdx) => {
                const align = colAlignments[cIdx] || 'left';
                return `
                    <td style="padding: 7px 10px; font-size: 10px; text-align: ${align}; border: 1px solid #e2e8f0; color: #1e293b;">
                        ${cell !== null && cell !== undefined ? String(cell) : '—'}
                    </td>
                `;
            }).join('')}
        </tr>
    `).join('');

    printEl.innerHTML = `
        <div style="margin-bottom: 24px; border-bottom: 4px solid #1C2D4F; padding-bottom: 16px; display: flex; align-items: center; justify-content: space-between;">
            <div style="display: flex; align-items: center; gap: 16px;">
                ${companyLogo ? `<img src="${companyLogo}" alt="Logo" style="height: 60px; max-width: 150px; object-fit: contain;" />` : ''}
                <div style="font-size: 11px; color: #475569; line-height: 1.4;">
                    <div style="font-size: 14px; font-weight: 800; text-transform: uppercase; color: #0f172a; margin-bottom: 2px;">
                        ${companyName}
                    </div>
                    ${companyCnpj ? `<div>CNPJ: ${companyCnpj}</div>` : ''}
                    ${companyPhone ? `<div>Tel: ${companyPhone}</div>` : ''}
                    ${companyEmail ? `<div>E-mail: ${companyEmail}</div>` : ''}
                </div>
            </div>
            
            <div style="text-align: right;">
                <h1 style="font-size: 20px; font-weight: 900; text-transform: uppercase; color: #1C2D4F; margin: 0 0 4px 0; letter-spacing: -0.02em;">
                    ${title}
                </h1>
                ${subtitle ? `<div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b;">${subtitle}</div>` : ''}
                <div style="font-size: 9px; color: #94a3b8; font-weight: 500; margin-top: 8px;">
                    <div>Gerado em: ${new Date().toLocaleString('pt-BR')}</div>
                    <div>Usuário: ${userName || 'Administrador'}</div>
                </div>
            </div>
        </div>

        ${cardsHtml}

        <table style="width: 100%; border-collapse: collapse; font-size: 10px; margin-bottom: 24px;">
            <thead>
                <tr style="background-color: #1C2D4F; color: #ffffff;">
                    ${headers.map((h, hIdx) => {
                        const align = colAlignments[hIdx] || 'left';
                        return `
                            <th style="padding: 8px 10px; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; text-align: ${align}; border: 1px solid #334155;">
                                ${h}
                            </th>
                        `;
                    }).join('')}
                </tr>
            </thead>
            <tbody>
                ${tableRowsHtml}
            </tbody>
        </table>

        <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #cbd5e1; padding-top: 12px; font-size: 9px; color: #64748b;">
            <span>Nexus Pro • Sistema de Gestão Inteligente</span>
            <span>Total de Registros: ${rows.length}</span>
        </div>
    `;

    document.body.appendChild(printEl);
    document.body.classList.add('is-printing');

    const cleanup = () => {
        document.body.classList.remove('is-printing');
        printEl.remove();
        window.removeEventListener('afterprint', cleanup);
    };

    window.addEventListener('afterprint', cleanup);

    // Timeout para permitir renderização de imagens e fontes antes do diálogo de impressão
    setTimeout(() => {
        window.print();
        setTimeout(cleanup, 2000);
    }, 250);
}
