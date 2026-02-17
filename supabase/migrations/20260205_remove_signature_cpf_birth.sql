-- Migration: Remove CPF e Data de Nascimento da assinatura, adiciona Data/Hora da assinatura
-- Data: 2026-02-05

-- Nota: Como os dados de assinatura estão armazenados em JSONB (form_data),
-- não precisamos alterar a estrutura da tabela 'orders'.
-- Os campos CPF e Nascimento simplesmente deixarão de ser salvos pelo frontend.

-- Esta migration serve apenas como documentação da mudança de schema lógico.
-- Os campos que serão removidos do frontend:
--   - 'Assinatura do Cliente - CPF'
--   - 'Assinatura do Cliente - Nascimento'

-- Os campos que serão adicionados:
--   - 'Assinatura do Cliente - Data'
--   - 'Assinatura do Cliente - Hora'

-- Se você quiser limpar dados antigos (OPCIONAL - cuidado!):
-- UPDATE orders 
-- SET form_data = form_data - 'Assinatura do Cliente - CPF' - 'Assinatura do Cliente - Nascimento'
-- WHERE form_data ? 'Assinatura do Cliente - CPF' OR form_data ? 'Assinatura do Cliente - Nascimento';

-- Comentário: Mantemos os dados históricos por padrão. 
-- Se quiser executar a limpeza, descomente a query acima.
