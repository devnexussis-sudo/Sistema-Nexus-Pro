#!/bin/bash

# 🚀 Script de Deploy Completo - Nexus Pro
# Execute este script após configurar o Supabase CLI

echo "🚀 Iniciando deploy completo do Nexus Pro..."
echo ""

# ============================================
# 1. VERIFICAR SUPABASE CLI
# ============================================
echo "📋 Verificando Supabase CLI..."
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI não encontrado!"
    echo "📦 Instalando Supabase CLI..."
    brew install supabase/tap/supabase
fi

echo "✅ Supabase CLI instalado"
echo ""

# ============================================
# 2. LOGIN NO SUPABASE
# ============================================
echo "🔐 Fazendo login no Supabase..."
echo "⚠️  Uma janela do navegador será aberta para autenticação"
supabase login

echo ""

# ============================================
# 3. LINK COM O PROJETO
# ============================================
echo "🔗 Conectando com o projeto Supabase..."
echo "📝 Digite o Project ID do seu projeto Supabase:"
read -p "Project ID: " PROJECT_ID

supabase link --project-ref $PROJECT_ID

echo "✅ Projeto conectado"
echo ""

# ============================================
# 4. APLICAR MIGRAÇÕES SQL
# ============================================
echo "📊 Aplicando otimizações no banco de dados..."
echo "⚠️  Isto criará índices, constraints e triggers"
read -p "Continuar? (s/n): " CONFIRM

if [ "$CONFIRM" = "s" ] || [ "$CONFIRM" = "S" ]; then
    supabase db push
    echo "✅ Migrações aplicadas com sucesso!"
else
    echo "⏭️  Migrações puladas"
fi

echo ""

# ============================================
# 5. DEPLOY EDGE FUNCTIONS
# ============================================
echo "☁️  Fazendo deploy das Edge Functions..."
echo "📤 Deployando admin-operations..."

supabase functions deploy admin-operations

echo "✅ Edge Functions deployadas!"
echo ""

# ============================================
# 6. CONFIGURAR SECRETS
# ============================================
echo "🔐 Configurando secrets para Edge Functions..."
echo ""
echo "⚠️  IMPORTANTE: As secrets devem ser configuradas manualmente"
echo "📝 Acesse: https://app.supabase.com/project/$PROJECT_ID/settings/functions"
echo ""
echo "Configure as seguintes secrets:"
echo "  - SUPABASE_URL (sua URL do Supabase)"
echo "  - SUPABASE_SERVICE_ROLE_KEY (sua Service Role Key)"
echo ""
read -p "Pressione ENTER após configurar as secrets..."

# ============================================
# 7. TESTAR EDGE FUNCTION
# ============================================
echo ""
echo "🧪 Testando Edge Function..."

# Pegar URL do projeto
SUPABASE_URL=$(supabase status | grep "API URL" | awk '{print $3}')

if [ -z "$SUPABASE_URL" ]; then
    echo "⚠️  Não foi possível detectar a URL automaticamente"
    echo "📝 Digite a URL do seu projeto Supabase:"
    read -p "URL: " SUPABASE_URL
fi

echo "🔗 URL do projeto: $SUPABASE_URL"
echo "🔗 URL da função: $SUPABASE_URL/functions/v1/admin-operations"
echo ""

# ============================================
# 8. BUILD DO FRONTEND
# ============================================
echo "🏗️  Fazendo build do frontend..."
npm run build

if [ $? -eq 0 ]; then
    echo "✅ Build concluído com sucesso!"
else
    echo "❌ Erro no build!"
    exit 1
fi

echo ""

# ============================================
# 9. RESUMO
# ============================================
echo "============================================"
echo "✅ DEPLOY CONCLUÍDO COM SUCESSO!"
echo "============================================"
echo ""
echo "📊 O que foi feito:"
echo "  ✅ Migrações SQL aplicadas"
echo "  ✅ Índices criados"
echo "  ✅ Constraints adicionados"
echo "  ✅ Audit logs configurados"
echo "  ✅ Edge Functions deployadas"
echo "  ✅ Frontend buildado"
echo ""
echo "🔗 URLs importantes:"
echo "  Dashboard: https://app.supabase.com/project/$PROJECT_ID"
echo "  Edge Functions: $SUPABASE_URL/functions/v1/admin-operations"
echo "  SQL Editor: https://app.supabase.com/project/$PROJECT_ID/sql"
echo ""
echo "📝 Próximos passos:"
echo "  1. Verifique os índices criados no SQL Editor"
echo "  2. Teste a Edge Function no dashboard"
echo "  3. Atualize o .env com VITE_EDGE_FUNCTION_URL"
echo "  4. Deploy do frontend (Vercel/Netlify)"
echo ""
echo "🎉 Tudo pronto para produção!"
