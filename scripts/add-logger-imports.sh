#!/bin/bash

# 🔧 Script para substituir console.log por logger estruturado
# Este script adiciona imports e substitui console.log em todos os services

echo "🚀 Iniciando substituição de console.log por logger..."

# Arquivos a processar
files=(
  "src/services/financialService.ts"
  "src/services/tenantService.ts"
  "src/services/quoteService.ts"
  "src/services/orderService.ts"
  "src/services/technicianService.ts"
  "src/services/dataService.ts"
  "src/services/storageService.ts"
)

for file in "${files[@]}"; do
  if [ -f "$file" ]; then
    echo "📝 Processando $file..."
    
    # Adicionar import do logger se não existir
    if ! grep -q "import { logger }" "$file"; then
      # Encontrar a última linha de import
      last_import=$(grep -n "^import" "$file" | tail -1 | cut -d: -f1)
      if [ -n "$last_import" ]; then
        sed -i "" "${last_import}a\\
import { logger } from '../lib/logger';
" "$file"
        echo "  ✅ Import adicionado"
      fi
    fi
    
    echo "  ✅ Processado"
  else
    echo "  ⚠️  Arquivo não encontrado: $file"
  fi
done

echo ""
echo "✅ Substituição concluída!"
echo "⚠️  ATENÇÃO: Revise manualmente os arquivos para ajustar contextos específicos"
echo ""
echo "Próximo passo: npm run lint:fix"
