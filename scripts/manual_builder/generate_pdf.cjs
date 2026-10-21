// scripts/manual_builder/generate_pdf.js
const fs = require('fs');
const path = require('path');
const { jsPDF } = require('jspdf');

function generatePdf(mdFilePath, outputPdfPath) {
  console.log(`[PDF Generator] Reading Markdown from: ${mdFilePath}`);
  const mdContent = fs.readFileSync(mdFilePath, 'utf-8');
  const lines = mdContent.split('\n');

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const marginLeft = 20;
  const marginRight = 20;
  const contentWidth = pageWidth - marginLeft - marginRight; // 170 mm
  const marginTop = 25;
  const marginBottom = 20;
  let currentY = marginTop;

  // Colors
  const COLOR_NAVY = [28, 45, 79];       // #1c2d4f
  const COLOR_EMERALD = [16, 185, 129];  // #10b981
  const COLOR_SLATE = [71, 85, 105];     // #475569
  const COLOR_DARK = [30, 41, 59];       // #1e293b
  const COLOR_LIGHT_BG = [248, 250, 252];// #f8fafc
  const COLOR_BORDER = [226, 232, 240];  // #e2e8f0

  function checkPageBreak(requiredHeight) {
    if (currentY + requiredHeight > pageHeight - marginBottom) {
      doc.addPage();
      currentY = marginTop;
      return true;
    }
    return false;
  }

  // --- 1. COVER PAGE ---
  doc.setFillColor(28, 45, 79); // Navy header block
  doc.rect(0, 0, pageWidth, 90, 'F');

  // Decorative Emerald line
  doc.setFillColor(16, 185, 129);
  doc.rect(0, 88, pageWidth, 4, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(32);
  doc.setTextColor(255, 255, 255);
  doc.text('DUNO', marginLeft, 45);

  doc.setFontSize(14);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(226, 232, 240);
  doc.text('Sistema de Gestão de Serviços, Manutenção e Operações de Campo', marginLeft, 58);

  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(28, 45, 79);
  doc.text('MANUAL OFICIAL DO USUÁRIO', marginLeft, 120);

  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text('Guia Operacional Passo a Passo — Plataforma Web e Aplicativo Móvel', marginLeft, 130);

  // Metadata Card
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(marginLeft, 150, contentWidth, 65, 3, 3, 'F');
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(marginLeft, 150, contentWidth, 65, 3, 3, 'S');

  doc.setFontSize(10);
  doc.setTextColor(30, 41, 59);
  doc.setFont('helvetica', 'bold');
  doc.text('Versão Oficial:', marginLeft + 10, 165);
  doc.setFont('helvetica', 'normal');
  doc.text('2.5 Pro (Edição 2026)', marginLeft + 50, 165);

  doc.setFont('helvetica', 'bold');
  doc.text('Data de Emissão:', marginLeft + 10, 175);
  doc.setFont('helvetica', 'normal');
  doc.text('Outubro de 2026', marginLeft + 50, 175);

  doc.setFont('helvetica', 'bold');
  doc.text('Público-Alvo:', marginLeft + 10, 185);
  doc.setFont('helvetica', 'normal');
  doc.text('Gestores, Despachantes, Atendentes, Faturamento e Técnicos de Campo', marginLeft + 50, 185);

  doc.setFont('helvetica', 'bold');
  doc.text('Classificação:', marginLeft + 10, 195);
  doc.setFont('helvetica', 'normal');
  doc.text('Documento Exclusivamente Funcional para Clientes e Operadores', marginLeft + 50, 195);

  doc.setFontSize(9);
  doc.setTextColor(148, 163, 184);
  doc.text('Duno Tecnologia e Gestão de Serviços • Todos os direitos reservados • 2026', marginLeft, 275);

  // --- 2. BODY CONTENT PARSING ---
  doc.addPage();
  currentY = marginTop;

  let inTable = false;
  let tableHeader = [];
  let tableRows = [];

  function flushTable() {
    if (!inTable) return;
    inTable = false;
    if (tableHeader.length === 0 && tableRows.length === 0) return;

    checkPageBreak(25);
    const colCount = tableHeader.length || (tableRows[0] ? tableRows[0].length : 1);
    const colWidth = contentWidth / colCount;

    // Draw header
    if (tableHeader.length > 0) {
      doc.setFillColor(241, 245, 249);
      doc.rect(marginLeft, currentY, contentWidth, 8, 'F');
      doc.setDrawColor(203, 213, 225);
      doc.rect(marginLeft, currentY, contentWidth, 8, 'S');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(28, 45, 79);
      for (let c = 0; c < tableHeader.length; c++) {
        const text = doc.splitTextToSize(tableHeader[c], colWidth - 4);
        doc.text(text[0] || '', marginLeft + c * colWidth + 2, currentY + 5.5);
      }
      currentY += 8;
    }

    // Draw rows
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);

    for (let r = 0; r < tableRows.length; r++) {
      checkPageBreak(8);
      const row = tableRows[r];
      if (r % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(marginLeft, currentY, contentWidth, 7, 'F');
      }
      doc.setDrawColor(226, 232, 240);
      doc.rect(marginLeft, currentY, contentWidth, 7, 'S');

      for (let c = 0; c < row.length; c++) {
        const text = doc.splitTextToSize(row[c] || '', colWidth - 4);
        doc.text(text[0] || '', marginLeft + c * colWidth + 2, currentY + 5);
      }
      currentY += 7;
    }
    currentY += 4;
    tableHeader = [];
    tableRows = [];
  }

  let i = 0;
  while (i < lines.length) {
    let line = lines[i].trim();

    // Skip empty lines
    if (!line) {
      if (inTable) flushTable();
      currentY += 2;
      i++;
      continue;
    }

    // Skip Markdown title in body (already on cover)
    if (line.startsWith('# MANUAL DO USUÁRIO')) {
      i++;
      continue;
    }

    // Tables
    if (line.startsWith('|')) {
      inTable = true;
      const rawCols = line.split('|').map(s => s.trim()).filter((s, idx, arr) => idx > 0 && idx < arr.length - 1);
      // Skip separator row like |:---|:---|
      if (rawCols.some(c => c.includes('---'))) {
        i++;
        continue;
      }
      if (tableHeader.length === 0) {
        tableHeader = rawCols;
      } else {
        tableRows.push(rawCols);
      }
      i++;
      continue;
    } else if (inTable) {
      flushTable();
    }

    // Heading 1 (PARTES)
    if (line.startsWith('# ')) {
      checkPageBreak(25);
      if (currentY > marginTop + 10) {
        doc.addPage();
        currentY = marginTop;
      }
      const title = line.replace(/^#\s+/, '');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.setTextColor(28, 45, 79);
      doc.text(title, marginLeft, currentY);
      currentY += 2;
      doc.setDrawColor(16, 185, 129);
      doc.setLineWidth(0.8);
      doc.line(marginLeft, currentY, marginLeft + contentWidth, currentY);
      currentY += 8;
      i++;
      continue;
    }

    // Heading 2 (CAPÍTULOS)
    if (line.startsWith('## ')) {
      checkPageBreak(18);
      const title = line.replace(/^##\s+/, '');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(28, 45, 79);
      doc.text(title, marginLeft, currentY);
      currentY += 6;
      i++;
      continue;
    }

    // Heading 3 (SEÇÕES)
    if (line.startsWith('### ')) {
      checkPageBreak(14);
      const title = line.replace(/^###\s+/, '');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.setTextColor(30, 41, 59);
      doc.text(title, marginLeft, currentY);
      currentY += 5;
      i++;
      continue;
    }

    // Heading 4
    if (line.startsWith('#### ')) {
      checkPageBreak(12);
      const title = line.replace(/^####\s+/, '');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(71, 85, 105);
      doc.text(title, marginLeft, currentY);
      currentY += 4.5;
      i++;
      continue;
    }

    // Callout / Blockquote (> 📘, > 💡, > ⚠️, > 🚫)
    if (line.startsWith('>')) {
      const alertText = line.replace(/^>\s*/, '').replace(/\*\*/g, '');
      const wrapped = doc.splitTextToSize(alertText, contentWidth - 10);
      const boxHeight = wrapped.length * 4.5 + 6;
      checkPageBreak(boxHeight + 2);

      let boxBg = [241, 245, 249];
      let barColor = [59, 130, 246]; // Blue
      if (alertText.includes('ATENÇÃO') || alertText.includes('CUIDADO')) {
        boxBg = [254, 242, 242]; // Light red
        barColor = [239, 68, 68];  // Red
      } else if (alertText.includes('DICA')) {
        boxBg = [240, 253, 244]; // Light green
        barColor = [16, 185, 129]; // Emerald
      }

      doc.setFillColor(boxBg[0], boxBg[1], boxBg[2]);
      doc.roundedRect(marginLeft, currentY, contentWidth, boxHeight, 1.5, 1.5, 'F');
      doc.setFillColor(barColor[0], barColor[1], barColor[2]);
      doc.roundedRect(marginLeft, currentY, 2.5, boxHeight, 1, 1, 'F');

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(30, 41, 59);
      doc.text(wrapped, marginLeft + 6, currentY + 4.5);
      currentY += boxHeight + 4;
      i++;
      continue;
    }

    // Bullet or Ordered List
    if (line.startsWith('* ') || line.startsWith('- ') || /^\d+\.\s+/.test(line)) {
      const isOrdered = /^\d+\.\s+/.test(line);
      const prefix = isOrdered ? line.match(/^\d+\.\s+/)[0] : '• ';
      const textOnly = line.replace(/^(\*|-|\d+\.)\s+/, '').replace(/\*\*/g, '');
      const wrapped = doc.splitTextToSize(textOnly, contentWidth - 10);
      const itemHeight = wrapped.length * 4 + 1.5;
      checkPageBreak(itemHeight);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(28, 45, 79);
      doc.text(prefix, marginLeft + 2, currentY);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(51, 65, 85);
      doc.text(wrapped, marginLeft + (isOrdered ? 8 : 6), currentY);
      currentY += itemHeight;
      i++;
      continue;
    }

    // Code block inside ```
    if (line.startsWith('```')) {
      i++;
      let codeLines = [];
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      const blockHeight = codeLines.length * 3.8 + 6;
      checkPageBreak(blockHeight);

      doc.setFillColor(248, 250, 252);
      doc.roundedRect(marginLeft, currentY, contentWidth, blockHeight, 1.5, 1.5, 'F');
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(marginLeft, currentY, contentWidth, blockHeight, 1.5, 1.5, 'S');

      doc.setFont('courier', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(30, 41, 59);
      for (let cIdx = 0; cIdx < codeLines.length; cIdx++) {
        doc.text(codeLines[cIdx].substring(0, 95), marginLeft + 4, currentY + 4.5 + cIdx * 3.8);
      }
      currentY += blockHeight + 3;
      continue;
    }

    // Standard Paragraph
    const cleanPara = line.replace(/\*\*/g, '');
    const wrappedPara = doc.splitTextToSize(cleanPara, contentWidth);
    const paraHeight = wrappedPara.length * 4.2 + 2;
    checkPageBreak(paraHeight);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(51, 65, 85);
    doc.text(wrappedPara, marginLeft, currentY);
    currentY += paraHeight;
    i++;
  }

  if (inTable) flushTable();

  // --- 3. RUNNING HEADER AND FOOTER ON ALL PAGES EXCEPT COVER ---
  const totalPages = doc.internal.getNumberOfPages();
  for (let p = 2; p <= totalPages; p++) {
    doc.setPage(p);

    // Running Header
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text('DUNO — SISTEMA DE GESTÃO DE SERVIÇOS E MANUTENÇÃO', marginLeft, 12);
    doc.setFont('helvetica', 'normal');
    doc.text('MANUAL OFICIAL DO USUÁRIO', pageWidth - marginRight - 48, 12);

    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.4);
    doc.line(marginLeft, 14, pageWidth - marginRight, 14);

    // Running Footer
    doc.line(marginLeft, pageHeight - 12, pageWidth - marginRight, pageHeight - 12);
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text('Versão Oficial 2.5 Pro • Uso Exclusivo de Treinamento e Operação', marginLeft, pageHeight - 8);
    doc.text(`Página ${p} de ${totalPages}`, pageWidth - marginRight - 22, pageHeight - 8);
  }

  console.log(`[PDF Generator] Writing ${totalPages} pages to: ${outputPdfPath}`);
  doc.save(outputPdfPath);
  console.log(`[PDF Generator] PDF successfully generated!`);
}

// CLI Execution
if (require.main === module) {
  const mdFile = path.resolve(__dirname, '../../docs/Manual_Usuario_Duno.md');
  const pdfFile = path.resolve(__dirname, '../../docs/Manual_Usuario_Duno.pdf');
  generatePdf(mdFile, pdfFile);
}

module.exports = { generatePdf };
