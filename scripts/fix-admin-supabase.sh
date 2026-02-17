#!/bin/bash

# 🔧 Script para corrigir adminSupabase em todos os services

echo "🔧 Iniciando correção global de adminSupabase..."
echo ""

FIXED_COUNT=0

# Lista de services para corrigir
SERVICES=(
  "authService.ts"
  "contractService.ts"
  "customerService.ts"
  "equipmentService.ts"
  "financialService.ts"
  "orderService.ts"
  "quoteService.ts"
  "stockService.ts"
  "technicianService.ts"
)

for service in "${SERVICES[@]}"; do
  FILE="src/services/$service"
  
  if [ -f "$FILE" ]; then
    echo "📝 Processando $service..."
    
    # Backup
    cp "$FILE" "$FILE.backup"
    
    # Garantir que supabase está importado
    if ! grep -q "import.*supabase.*from.*supabase" "$FILE"; then
      # Adicionar import na linha após imports existentes
      sed -i.tmp '1a\
import { supabase } from '"'"'../lib/supabase'"'"';
' "$FILE"
      rm -f "$FILE.tmp"
    fi
    
    # Substituir adminSupabase.from por supabase.from
    sed -i.tmp 's/adminSupabase\.from/supabase.from/g' "$FILE"
    rm -f "$FILE.tmp"
    
    # Contar substituições
    COUNT=$(grep -c "supabase\.from" "$FILE" || echo "0")
    
    echo "  ✅ $COUNT queries corrigidas"
    FIXED_COUNT=$((FIXED_COUNT + COUNT))
    
  else
    echo "  ⚠️  Arquivo não encontrado: $FILE"
  fi
  
  echo ""
done

echo "============================================"
echo "✅ CORREÇÃO CONCLUÍDA!"
echo "============================================"
echo "Total de queries corrigidas: $FIXED_COUNT"
echo ""
echo "📝 Backups criados em: *.backup"
echo "🧪 Teste o sistema agora!"
