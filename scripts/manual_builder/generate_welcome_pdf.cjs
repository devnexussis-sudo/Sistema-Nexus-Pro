// scripts/manual_builder/generate_welcome_pdf.cjs
const fs = require('fs');
const path = require('path');
const { jsPDF } = require('jspdf');

function makePdf() {
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
  const contentWidth = pageWidth - marginLeft - marginRight; // 170mm

  // Header Banner (Navy #1c2d4f)
  doc.setFillColor(28, 45, 79);
  doc.rect(0, 0, pageWidth, 45, 'F');
  
  // Emerald Accent Line (#10b981)
  doc.setFillColor(16, 185, 129);
  doc.rect(0, 44, pageWidth, 2.5, 'F');

  // Logo Duno
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(28);
  doc.setTextColor(255, 255, 255);
  doc.text('DUNO', marginLeft, 24);
  
  doc.setTextColor(16, 185, 129);
  doc.text('.', marginLeft + 33, 24);

  doc.setFontSize(10.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(203, 213, 225);
  doc.text('Sistema de Gestão de Serviços, Manutenção e Operações de Campo', marginLeft, 33);

  // Welcome Pill on Right
  doc.setFillColor(16, 185, 129);
  doc.roundedRect(pageWidth - marginRight - 36, 16, 36, 8, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(255, 255, 255);
  doc.text('BOAS-VINDAS', pageWidth - marginRight - 32, 21.5);

  let y = 58;

  // Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.setTextColor(28, 45, 79);
  doc.text('Seja Muito Bem-Vindo ao Ecossistema Duno!', marginLeft, y);
  y += 8;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(51, 65, 85);
  const lead = doc.splitTextToSize('É com imensa satisfação que damos as boas-vindas à sua empresa. A partir de hoje, sua operação dá um passo definitivo rumo à modernização, agilidade e excelência na gestão de serviços e manutenção, conectando o escritório e a equipe de rua em tempo real.', contentWidth);
  doc.text(lead, marginLeft, y);
  y += lead.length * 4.8 + 5;

  // Credenciais Card
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(marginLeft, y, contentWidth, 68, 2, 2, 'F');
  doc.setDrawColor(28, 45, 79);
  doc.setLineWidth(0.6);
  doc.roundedRect(marginLeft, y, contentWidth, 68, 2, 2, 'S');

  // Header of Credentials
  doc.setFillColor(28, 45, 79);
  doc.rect(marginLeft, y, contentWidth, 8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(255, 255, 255);
  doc.text('DADOS DE ACESSO AO PAINEL ADMINISTRATIVO', marginLeft + 4, y + 5.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(167, 243, 208);
  doc.text('Ambiente Corporativo Seguro', pageWidth - marginRight - 42, y + 5.5);
  y += 12;

  const creds = [
    { label: 'Endereço Web (URL):', val: 'https://app.duno.com.br', note: 'Acesso via computador ou tablet em qualquer navegador' },
    { label: 'Código da Empresa:', val: '[NOME-DA-SUA-EMPRESA]', note: 'Identificador único da sua organização' },
    { label: 'E-mail do Administrador:', val: 'admin@suaempresa.com.br', note: 'Login principal com permissões de gestão' },
    { label: 'Senha Temporária Inicial:', val: 'Duno@2026#Ativa', note: 'Exige troca obrigatória no primeiro acesso' },
    { label: 'Código PIN Operacional:', val: '[PIN: 849201]', note: 'Assinatura rápida de 6 dígitos para conferências' },
    { label: 'Aplicativo do Técnico:', val: 'App Duno (Android / iOS / PWA)', note: 'Instalação móvel para equipe de campo com modo offline' }
  ];

  creds.forEach((c) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(28, 45, 79);
    doc.text(c.label, marginLeft + 4, y);

    doc.setFont('courier', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);
    doc.text(c.val, marginLeft + 48, y);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(c.note, marginLeft + 105, y);

    y += 9;
  });

  y += 6;

  // Warning Box
  doc.setFillColor(254, 242, 242);
  doc.roundedRect(marginLeft, y, contentWidth, 12, 1.5, 1.5, 'F');
  doc.setFillColor(239, 68, 68);
  doc.roundedRect(marginLeft, y, 2.5, 12, 1, 1, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(185, 28, 28);
  doc.text('Aviso Importante:', marginLeft + 6, y + 5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(153, 27, 27);
  doc.text('No seu primeiro acesso, acesse o menu de Perfil (topo direito) e altere a senha temporária para uma credencial pessoal forte.', marginLeft + 33, y + 5);
  doc.text('Padrão recomendado: no mínimo 8 caracteres contendo ao menos uma letra maiúscula e um número.', marginLeft + 6, y + 9);
  y += 18;

  // Primeiros Passos
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(28, 45, 79);
  doc.text('Checklist de Implantação Rápida (Primeiros Passos)', marginLeft, y);
  y += 2;
  doc.setDrawColor(226, 232, 240);
  doc.line(marginLeft, y, marginLeft + contentWidth, y);
  y += 6;

  const steps = [
    { num: '1', title: 'Personalize sua Marca:', desc: 'Em Configurações > Empresa, insira seu CNPJ, dados de contato e Logotipo oficial para laudos em PDF.' },
    { num: '2', title: 'Cadastre sua Equipe:', desc: 'Em Cadastros > Usuários e Técnicos, cadastre atendentes e técnicos que utilizarão o aplicativo móvel.' },
    { num: '3', title: 'Cadastre Clientes e Ativos:', desc: 'Registre seus clientes e aparelhos com número de série e imprima etiquetas com QR Code.' },
    { num: '4', title: 'Estruture o Almoxarifado:', desc: 'Cadastre peças e transfira o saldo inicial para o estoque móvel do veículo de cada técnico.' },
    { num: '5', title: 'Emita a Primeira OS:', desc: 'Em Ordens de Serviço > Nova OS, use o Wizard em 5 etapas e acompanhe o chamado no celular do técnico.' }
  ];

  steps.forEach((s) => {
    doc.setFillColor(16, 185, 129);
    doc.circle(marginLeft + 3, y + 1.5, 2.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(255, 255, 255);
    doc.text(s.num, marginLeft + 2, y + 2.5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(28, 45, 79);
    doc.text(s.title, marginLeft + 8, y + 2);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    const dLines = doc.splitTextToSize(s.desc, contentWidth - 45);
    doc.text(dLines, marginLeft + 42, y + 2);

    y += 7.5;
  });

  y += 4;

  // Card do Manual Completo
  doc.setFillColor(239, 246, 255);
  doc.roundedRect(marginLeft, y, contentWidth, 24, 2, 2, 'F');
  doc.setDrawColor(59, 130, 246);
  doc.setLineWidth(0.4);
  doc.roundedRect(marginLeft, y, contentWidth, 24, 2, 2, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(30, 64, 175);
  doc.text('Manual Completo do Usuário Duno (Versão 2.5 Pro — 49 Páginas)', marginLeft + 5, y + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(30, 58, 138);
  doc.text('O guia definitivo com 100% dos procedimentos passo a passo, checklists, WhatsApp com IA (Lia) e financeiro.', marginLeft + 5, y + 11);
  doc.text('Disponível na pasta docs/: Manual_Usuario_Duno.pdf (PDF Oficial) e Manual_Usuario_Duno.docx (Word Editável).', marginLeft + 5, y + 16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(29, 78, 216);
  doc.text('Consulte os arquivos na pasta docs/ do seu projeto para treinamento completo.', marginLeft + 5, y + 21);

  y += 30;

  // Suporte e Rodapé
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(28, 45, 79);
  doc.text('Canais de Suporte:', marginLeft, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text('Chat no Painel (Online) • WhatsApp: (11) 98765-4321 • E-mail: suporte@duno.com.br', marginLeft + 30, y);

  y += 10;
  doc.setDrawColor(226, 232, 240);
  doc.line(marginLeft, y, marginLeft + contentWidth, y);
  y += 5;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(28, 45, 79);
  doc.text('Equipe de Onboarding & Sucesso do Cliente • Duno Tecnologia', marginLeft, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text('www.duno.com.br • Sistema de Gestão de Serviços, Manutenção e Operações de Campo • 2026', marginLeft, y + 4);

  const outputPath = path.resolve(__dirname, '../../docs/Carta_Boas_Vindas_Duno.pdf');
  doc.save(outputPath);
  console.log('[PDF Welcome] PDF gerado com sucesso em: ' + outputPath);
}

makePdf();
