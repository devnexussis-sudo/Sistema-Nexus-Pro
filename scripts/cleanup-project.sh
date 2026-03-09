#!/bin/bash

# 🧹 Script de Limpeza e Otimização do Projeto
# Execute periodicamente para manter o projeto limpo

echo "🧹 Iniciando limpeza e otimização do projeto..."
echo ""

# ============================================
# 1. LIMPAR NODE_MODULES E REINSTALAR
# ============================================
echo "📦 Limpando node_modules..."
rm -rf node_modules
rm -f package-lock.json

echo "📦 Reinstalando dependências..."
npm install

echo "✅ Dependências reinstaladas"
echo ""

# ============================================
# 2. LIMPAR CACHE DO VITE
# ============================================
echo "🗑️  Limpando cache do Vite..."
rm -rf node_modules/.vite
rm -rf dist

echo "✅ Cache limpo"
echo ""

# ============================================
# 3. VERIFICAR E CORRIGIR DEPENDÊNCIAS
# ============================================
echo "🔍 Verificando dependências..."
npm audit

echo ""
echo "🔧 Corrigindo vulnerabilidades..."
npm audit fix

echo "✅ Dependências verificadas"
echo ""

# ============================================
# 4. FORMATAR TODO O CÓDIGO
# ============================================
echo "✨ Formatando código..."
npm run format

echo "✅ Código formatado"
echo ""

# ============================================
# 5. EXECUTAR LINTER
# ============================================
echo "🔍 Executando linter..."
npm run lint:fix

echo "✅ Linter executado"
echo ""

# ============================================
# 6. VERIFICAR TIPOS
# ============================================
echo "📝 Verificando tipos TypeScript..."
npm run type-check

echo "✅ Tipos verificados"
echo ""

# ============================================
# 7. EXECUTAR TESTES
# ============================================
echo "🧪 Executando testes..."
npm run test

echo "✅ Testes executados"
echo ""

# ============================================
# 8. ANALISAR BUNDLE SIZE
# ============================================
echo "📊 Analisando tamanho do bundle..."
ANALYZE=true npm run build

echo "✅ Bundle analisado (verifique dist/stats.html)"
echo ""

# ============================================
# 9. GERAR RELATÓRIO DE COBERTURA
# ============================================
echo "📈 Gerando relatório de cobertura..."
npm run test:coverage

echo "✅ Relatório gerado (verifique coverage/index.html)"
echo ""

# ============================================
# 10. VERIFICAR ARQUIVOS GRANDES
# ============================================
echo "📏 Procurando arquivos grandes (>1MB)..."
find src -type f -size +1M -exec ls -lh {} \;

echo ""

# ============================================
# 11. PROCURAR console.log REMANESCENTES
# ============================================
echo "🔍 Procurando console.log no código..."
CONSOLE_COUNT=$(grep -r "console.log" src --include="*.ts" --include="*.tsx" | wc -l)

if [ $CONSOLE_COUNT -gt 0 ]; then
    echo "⚠️  Encontrados $CONSOLE_COUNT console.log no código"
    echo "📝 Substitua por logger estruturado"
else
    echo "✅ Nenhum console.log encontrado"
fi

echo ""

# ============================================
# 12. PROCURAR TODOs
# ============================================
echo "📝 Procurando TODOs no código..."
TODO_COUNT=$(grep -r "TODO" src --include="*.ts" --include="*.tsx" | wc -l)

if [ $TODO_COUNT -gt 0 ]; then
    echo "📋 Encontrados $TODO_COUNT TODOs"
    grep -r "TODO" src --include="*.ts" --include="*.tsx" -n | head -20
else
    echo "✅ Nenhum TODO encontrado"
fi

echo ""

# ============================================
# RESUMO FINAL
# ============================================
echo "============================================"
echo "✅ LIMPEZA E OTIMIZAÇÃO CONCLUÍDA!"
echo "============================================"
echo ""
echo "📊 Estatísticas:"
echo "  - Dependências: Atualizadas"
echo "  - Código: Formatado e lintado"
echo "  - Testes: Executados"
echo "  - Bundle: Analisado"
echo "  - Cobertura: Gerada"
echo ""
echo "📂 Relatórios gerados:"
echo "  - dist/stats.html (bundle size)"
echo "  - coverage/index.html (cobertura de testes)"
echo ""
echo "🎯 Próximos passos:"
echo "  1. Revisar relatórios"
echo "  2. Corrigir warnings do linter"
echo "  3. Aumentar cobertura de testes"
echo "  4. Remover console.log restantes"
echo ""
