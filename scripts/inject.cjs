const fs = require('fs');
const path = require('path');

const adminDir = '/Users/alexcruz/Documents/Duno Project 2026 - full/Project Nexus Full/src/components/admin';
const files = fs.readdirSync(adminDir).filter(f => f.endsWith('.tsx'));

const commonReplacements = [
  { pt: />Salvar</g, key: '>{t.common.save}<' },
  { pt: />Cancelar</g, key: '>{t.common.cancel}<' },
  { pt: />Editar</g, key: '>{t.common.edit}<' },
  { pt: />Excluir</g, key: '>{t.common.delete}<' },
  { pt: />Status</g, key: '>{t.common.status}<' },
  { pt: />Ações</g, key: '>{t.common.actions}<' },
  { pt: />Nome</g, key: '>{t.common.name}<' },
  { pt: />E-mail</g, key: '>{t.common.email}<' },
  { pt: />Telefone</g, key: '>{t.common.phone}<' },
  { pt: />Todos</g, key: '>{t.common.all}<' },
  { pt: />Buscar</g, key: '>{t.common.search}<' },
  { pt: />Filtrar</g, key: '>{t.common.filter}<' },
  { pt: />Novo</g, key: '>{t.common.create}<' },
  { pt: />Detalhes</g, key: '>Detalhes<' }, // Ignore for now
];

files.forEach(file => {
  const filePath = path.join(adminDir, file);
  let content = fs.readFileSync(filePath, 'utf-8');

  let modified = false;

  // Add import if we need to replace things
  let hasMatch = commonReplacements.some(r => content.match(r.pt));
  
  if (hasMatch) {
    if (!content.includes('useI18n')) {
      content = content.replace(/(import React.*?from 'react';\n)/, `$1import { useI18n } from '../../i18n';\n`);
      modified = true;
    }

    const componentMatch = content.match(/export const (\w+)[\s:=]/);
    if (componentMatch) {
      const compName = componentMatch[1];
      const hookRegex = new RegExp(`(export const ${compName}[^=]*=.*?=>\\s*\\{)`);
      if (!content.includes('const { t } = useI18n()') && !content.includes('const { t, formatCurrency, formatDate } = useI18n()')) {
        content = content.replace(hookRegex, `$1\n  const { t } = useI18n();\n`);
        modified = true;
      }
    }

    commonReplacements.forEach(r => {
      if (content.match(r.pt)) {
        content = content.replace(r.pt, r.key);
        modified = true;
      }
    });
  }

  if (modified) {
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(`Translated common words in ${file}`);
  }
});
