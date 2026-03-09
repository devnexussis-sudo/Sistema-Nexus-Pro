-- Migration para criar tabela de sequências e função de incremento atômico
-- Copie e rode este SQL no Editor SQL do seu projeto Supabase

-- 1. Tabela para controlar a numeração por empresa
CREATE TABLE IF NOT EXISTS public.tenant_sequences (
    tenant_id UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
    last_order_id INTEGER DEFAULT 0
);

-- Habilitar RLS (embora essa tabela seja acessada via RPC/Function com service role idealmente)
ALTER TABLE public.tenant_sequences ENABLE ROW LEVEL SECURITY;

-- 2. Função RPC segura para pegar o próximo ID
CREATE OR REPLACE FUNCTION public.get_next_order_id(p_tenant_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER -- Roda com privilégios de admin para garantir a sequência sem expor a tabela
AS $$
DECLARE
    next_val INTEGER;
BEGIN
    -- Garante que existe o registro da empresa
    INSERT INTO public.tenant_sequences (tenant_id, last_order_id)
    VALUES (p_tenant_id, 0)
    ON CONFLICT (tenant_id) DO NOTHING;

    -- Incrementa atomicamente e retorna
    UPDATE public.tenant_sequences
    SET last_order_id = last_order_id + 1
    WHERE tenant_id = p_tenant_id
    RETURNING last_order_id INTO next_val;

    RETURN next_val;
END;
$$;

-- Grant execute para usuários autenticados (necessário para chamar via SDK/Edge Function com contexto do usuário)
GRANT EXECUTE ON FUNCTION public.get_next_order_id TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_next_order_id TO service_role;
