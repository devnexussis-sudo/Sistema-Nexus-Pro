const fs = require('fs');
const path = require('path');

const adminDir = '/Users/alexcruz/Documents/Duno Project 2026 - full/Project Nexus Full/src/components/admin';
const files = fs.readdirSync(adminDir).filter(f => f.endsWith('.tsx'));

files.forEach(file => {
  const filePath = path.join(adminDir, file);
  let content = fs.readFileSync(filePath, 'utf-8');

  // If it has "useI18n" import but NOT "const { t }"
  if (content.includes('useI18n') && !content.includes('const { t }') && !content.includes('const { t,')) {
    // Look for export const ComponentName = ... => {
    // and inject right after the {
    let replaced = false;
    content = content.replace(/(export const \w+(?::\s*React\.FC(?:<[^>]+>)?\s*)?=\s*(?:async\s*)?(?:\([^)]*\)|[^=]*)\s*=>\s*\{)/, (match) => {
      replaced = true;
      return match + '\n    const { t } = useI18n();\n';
    });
    
    // Fallback if it's exported differently (e.g. function)
    if (!replaced) {
        content = content.replace(/(export default function \w+\([^)]*\)\s*\{)/, (match) => {
            replaced = true;
            return match + '\n    const { t } = useI18n();\n';
        });
    }

    if (replaced) {
        fs.writeFileSync(filePath, content, 'utf-8');
        console.log(`Fixed missing t in ${file}`);
    } else {
        console.log(`Failed to fix missing t in ${file} - regex mismatch`);
    }
  }
});
