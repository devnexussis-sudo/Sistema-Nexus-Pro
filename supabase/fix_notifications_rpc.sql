-- ==============================================================================
-- FIX ABSOLUTO: Envio de Notificações via RPC (Remote Procedure Call)
-- Como o Master Admin usa o cliente anon (sem sessão Auth persistente),
-- inserir dados diretamente nas tabelas com RLS ligado frequentemente conflita
-- com as policies de tenant isolation (uso de auth.uid() e afins).
-- Esta função contorna isso executando a inserção com privilégios de administrador (SECURITY DEFINER).
-- ==============================================================================

-- 1. Garante que as colunas existem (caso algo tenha falhado no script anterior)
ALTER TABLE public.system_notifications ADD COLUMN IF NOT EXISTS priority text DEFAULT 'info';
ALTER TABLE public.system_notifications ADD COLUMN IF NOT EXISTS target_tenants uuid[] DEFAULT NULL;
ALTER TABLE public.system_notifications ADD COLUMN IF NOT EXISTS content text;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'system_notifications' 
        AND column_name = 'type'
    ) THEN
        ALTER TABLE public.system_notifications ADD COLUMN type text DEFAULT 'broadcast';
    END IF;
END $$;

-- 2. Cria a função RPC que bypassa o RLS
CREATE OR REPLACE FUNCTION public.master_broadcast_notification(
    p_title text,
    p_content text,
    p_type text,
    p_priority text,
    p_target_tenants uuid[] DEFAULT NULL
) 
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER -- Executa como o criador da função (bypassa RLS)
SET search_path = public
AS $$
DECLARE
    v_result json;
    v_id uuid;
BEGIN
    INSERT INTO public.system_notifications (
        title, 
        content, 
        type, 
        priority, 
        target_tenants
    ) VALUES (
        p_title,
        p_content,
        p_type,
        p_priority,
        p_target_tenants
    )
    RETURNING id INTO v_id;
    
    -- Retorna sucesso
    v_result := json_build_object('success', true, 'id', v_id);
    RETURN v_result;
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 3. Concede acesso à função para o Master Panel (anon e authenticated)
GRANT EXECUTE ON FUNCTION public.master_broadcast_notification TO anon;
GRANT EXECUTE ON FUNCTION public.master_broadcast_notification TO authenticated;

-- 4. Notifica PostgREST
NOTIFY pgrst, 'reload schema';
