-- 🛡️ Nexus Pro - Migration para Acesso Público do Checkout e RLS de Faturas
-- Autor: Antigravity AI
-- Data: 2026-09-04

BEGIN;

-- 1. Limpar TODAS as assinaturas sobrecarregadas antigas da função get_public_document para evitar erro PGRST203
DROP FUNCTION IF EXISTS public.get_public_document(text, text);
DROP FUNCTION IF EXISTS public.get_public_document(uuid, text);
DROP FUNCTION IF EXISTS public.get_public_document(text, uuid);

-- 2. Liberar Leitura Pública para Invoices (Faturas) no Checkout Seguro
DROP POLICY IF EXISTS "invoices_public_read" ON public.invoices;
CREATE POLICY "invoices_public_read" ON public.invoices
  FOR SELECT TO anon
  USING (true);

-- 3. Liberar Leitura Pública para Invoice Items
DROP POLICY IF EXISTS "invoice_items_public_read" ON public.invoice_items;
CREATE POLICY "invoice_items_public_read" ON public.invoice_items
  FOR SELECT TO anon
  USING (true);

-- 4. Assegurar que Quotes (Orçamentos) e Orders (Ordens de Serviço) possuem acesso público total em SELECT
DROP POLICY IF EXISTS "quotes_public_read" ON public.quotes;
CREATE POLICY "quotes_public_read" ON public.quotes
  FOR SELECT TO anon
  USING (true);

DROP POLICY IF EXISTS "orders_public_read" ON public.orders;
CREATE POLICY "orders_public_read" ON public.orders
  FOR SELECT TO anon
  USING (true);

-- 5. Função RPC única e inequívoca para obtenção de documentos públicos (SECURITY DEFINER - Bypassa RLS)
CREATE OR REPLACE FUNCTION public.get_public_document(doc_token text, doc_type text DEFAULT 'quote')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF doc_type = 'quote' THEN
    SELECT to_jsonb(q.*) INTO v_result
    FROM public.quotes q
    WHERE q.id::text = doc_token
       OR q.public_token::text = doc_token
       OR q.display_id = doc_token
    LIMIT 1;

    -- Se não achou na quotes, faz fallback para orders e invoices
    IF v_result IS NULL THEN
      SELECT to_jsonb(o.*) INTO v_result
      FROM public.orders o
      WHERE o.id::text = doc_token
         OR o.public_token::text = doc_token
         OR o.display_id = doc_token
      LIMIT 1;
    END IF;

    IF v_result IS NULL THEN
      SELECT to_jsonb(i.*) INTO v_result
      FROM public.invoices i
      WHERE i.id::text = doc_token
         OR i.display_id = doc_token
      LIMIT 1;
    END IF;

  ELSIF doc_type = 'order' THEN
    SELECT to_jsonb(o.*) INTO v_result
    FROM public.orders o
    WHERE o.id::text = doc_token
       OR o.public_token::text = doc_token
       OR o.display_id = doc_token
    LIMIT 1;

    IF v_result IS NULL THEN
      SELECT to_jsonb(q.*) INTO v_result
      FROM public.quotes q
      WHERE q.id::text = doc_token
         OR q.public_token::text = doc_token
         OR q.display_id = doc_token
      LIMIT 1;
    END IF;

    IF v_result IS NULL THEN
      SELECT to_jsonb(i.*) INTO v_result
      FROM public.invoices i
      WHERE i.id::text = doc_token
         OR i.display_id = doc_token
      LIMIT 1;
    END IF;

  ELSIF doc_type = 'invoice' THEN
    SELECT to_jsonb(i.*) INTO v_result
    FROM public.invoices i
    WHERE i.id::text = doc_token
       OR i.display_id = doc_token
    LIMIT 1;

    IF v_result IS NULL THEN
      SELECT to_jsonb(q.*) INTO v_result
      FROM public.quotes q
      WHERE q.id::text = doc_token
         OR q.public_token::text = doc_token
         OR q.display_id = doc_token
      LIMIT 1;
    END IF;

    IF v_result IS NULL THEN
      SELECT to_jsonb(o.*) INTO v_result
      FROM public.orders o
      WHERE o.id::text = doc_token
         OR o.public_token::text = doc_token
         OR o.display_id = doc_token
      LIMIT 1;
    END IF;
  END IF;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_document(text, text) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
