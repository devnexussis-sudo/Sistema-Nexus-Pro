const fs = require('fs');
const path = require('path');

const adminDir = '/Users/alexcruz/Documents/Duno Project 2026 - full/Project Nexus Full/src/components/admin';
const filesToProcess = ['UserManagement.tsx', 'FinancialDashboard.tsx', 'StockManagement.tsx'];

filesToProcess.forEach(file => {
  const filePath = path.join(adminDir, file);
  if (!fs.existsSync(filePath)) return;

  let content = fs.readFileSync(filePath, 'utf-8');

  // Skip if already imported
  if (!content.includes('useI18n')) {
    // Inject import after React import
    content = content.replace(/(import React.*?from 'react';\n)/, `$1import { useI18n } from '../../i18n';\n`);
  }

  // Inject hook inside the main component
  const componentNameMatch = content.match(/export const (\w+)[\s:=]/);
  if (componentNameMatch) {
    const compName = componentNameMatch[1];
    const hookInjectionStr = `\n  const { t, formatCurrency, formatDate } = useI18n();\n`;
    const regex = new RegExp(`(export const ${compName}[^=]*=.*?=>\\s*\\{)`);
    if (!content.includes('useI18n()') && !content.includes('useI18n();')) {
      content = content.replace(regex, `$1${hookInjectionStr}`);
    }
  }

  // specific replacements
  if (file === 'UserManagement.tsx') {
    content = content.replace(/>Gerenciamento de Usuários</g, '>{t.users.title}<');
    content = content.replace(/>Novo Usuário</g, '>{t.users.createUser}<');
    content = content.replace(/>Grupos e Permissões</g, '>{t.users.permissionGroups}<');
    content = content.replace(/>Perfil</g, '>{t.users.role}<');
    content = content.replace(/>Último acesso</g, '>{t.users.lastAccess}<');
  }

  if (file === 'FinancialDashboard.tsx') {
    content = content.replace(/>Visão Financeira</g, '>{t.financial.title}<');
    content = content.replace(/>Receita</g, '>{t.financial.revenue}<');
    content = content.replace(/>Despesas</g, '>{t.financial.expenses}<');
    content = content.replace(/>Lucro</g, '>{t.financial.profit}<');
    content = content.replace(/>A Receber</g, '>{t.financial.pending}<');
    content = content.replace(/>Vencido</g, '>{t.financial.overdue}<');
  }

  if (file === 'StockManagement.tsx') {
    content = content.replace(/>Gestão de Estoque</g, '>{t.stock.title}<');
    content = content.replace(/>Em Estoque</g, '>{t.stock.inStock}<');
    content = content.replace(/>Estoque Baixo</g, '>{t.stock.lowStock}<');
    content = content.replace(/>Sem Estoque</g, '>{t.stock.outOfStock}<');
    content = content.replace(/>Adicionar Item</g, '>{t.stock.addItem}<');
  }

  // Common replacements
  content = content.replace(/>Salvar</g, '>{t.common.save}<');
  content = content.replace(/>Cancelar</g, '>{t.common.cancel}<');
  content = content.replace(/>Editar</g, '>{t.common.edit}<');
  content = content.replace(/>Excluir</g, '>{t.common.delete}<');

  fs.writeFileSync(filePath, content, 'utf-8');
  console.log(`Processed ${file}`);
});
