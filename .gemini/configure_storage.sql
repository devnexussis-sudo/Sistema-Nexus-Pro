-- ============================================
-- SCRIPT SQL: Configuração do Storage para Imagens/Assinaturas
-- Execute no SQL Editor do Supabase
-- ============================================

-- 1. CRIAR BUCKET DE ARMAZENAMENTO
-- Nota: Buckets são criados pela interface do Supabase, não por SQL
-- Vá em: Storage → Create Bucket → Nome: "order-attachments"
-- Marque como "Public" para facilitar acesso às imagens

-- 2. POLÍTICAS DE SEGURANÇA PARA O BUCKET
-- Estas políticas permitem upload e download de arquivos

-- Permitir upload de arquivos (INSERT)
CREATE POLICY "Permitir upload de anexos"
ON storage.objects
FOR INSERT
TO public
WITH CHECK (bucket_id = 'order-attachments');

-- Permitir visualização de arquivos (SELECT)
CREATE POLICY "Permitir visualização de anexos"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'order-attachments');

-- Permitir atualização de arquivos (UPDATE)
CREATE POLICY "Permitir atualização de anexos"
ON storage.objects
FOR UPDATE
TO public
USING (bucket_id = 'order-attachments');

-- Permitir exclusão de arquivos (DELETE)
CREATE POLICY "Permitir exclusão de anexos"
ON storage.objects
FOR DELETE
TO public
USING (bucket_id = 'order-attachments');

-- ============================================
-- ESTRUTURA DE PASTAS RECOMENDADA
-- ============================================

/*
order-attachments/
├── orders/
│   ├── ord-1001/
│   │   ├── photos/
│   │   │   ├── photo-1.jpg
│   │   │   ├── photo-2.jpg
│   │   └── signatures/
│   │       ├── signature-client.png
│   │       └── signature-tech.png
│   ├── ord-1002/
│   │   ├── photos/
│   │   └── signatures/
*/

-- ============================================
-- ATUALIZAÇÃO DA TABELA ORDERS
-- ============================================

-- Adicionar coluna para armazenar metadados dos anexos
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '{"photos": [], "signatures": []}'::jsonb;

-- Comentário explicativo
COMMENT ON COLUMN public.orders.attachments IS 'Armazena URLs e metadados de fotos e assinaturas anexadas à ordem';

-- ============================================
-- EXEMPLO DE ESTRUTURA DO CAMPO attachments
-- ============================================

/*
{
  "photos": [
    {
      "id": "photo-1",
      "url": "https://[project].supabase.co/storage/v1/object/public/order-attachments/orders/ord-1001/photos/photo-1.jpg",
      "fieldId": "q3",
      "uploadedAt": "2024-01-27T15:30:00Z",
      "uploadedBy": "tech-1"
    }
  ],
  "signatures": [
    {
      "id": "signature-1",
      "url": "https://[project].supabase.co/storage/v1/object/public/order-attachments/orders/ord-1001/signatures/signature-client.png",
      "fieldId": "q4",
      "signerName": "João Silva",
      "uploadedAt": "2024-01-27T15:35:00Z"
    }
  ]
}
*/

-- ============================================
-- CONFIRMAÇÃO
-- ============================================

SELECT 'Configuração de Storage preparada! Agora crie o bucket "order-attachments" na interface do Supabase.' as status;
