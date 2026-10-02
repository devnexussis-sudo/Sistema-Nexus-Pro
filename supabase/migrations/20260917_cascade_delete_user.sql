-- ==============================================================================
-- MIGRATION: EXCLUSÃO EM CASCATA DE USUÁRIO E TÉCNICO (PADRÃO BIGTECH)
-- ==============================================================================
-- Apaga limpa e instantaneamente a conta de autenticação (auth.users),
-- o registro corporativo (public.users) e o perfil de técnico (public.technicians),
-- desvinculando O.S. abertas de forma segura para não perder histórico financeiro.
-- ==============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.delete_user_cascade(UUID);

CREATE OR REPLACE FUNCTION public.delete_user_cascade(p_user_id UUID)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id UUID;
  v_caller_role TEXT;
  v_tenant_id UUID;
  v_target_tenant_id UUID;
BEGIN
  -- 1. Identificar o usuário executador
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Não autorizado: Sessão não encontrada');
  END IF;

  -- 2. Não permitir auto-exclusão por esta rota
  IF v_caller_id = p_user_id THEN
    RETURN json_build_object('success', false, 'error', 'Você não pode excluir sua própria conta enquanto estiver logado.');
  END IF;

  -- 3. Obter tenant e papel do executador
  SELECT tenant_id, UPPER(role::text) INTO v_tenant_id, v_caller_role
  FROM public.users
  WHERE id = v_caller_id;

  -- 4. Obter tenant do usuário alvo
  SELECT tenant_id INTO v_target_tenant_id
  FROM public.users
  WHERE id = p_user_id;

  IF v_target_tenant_id IS NULL THEN
    SELECT tenant_id INTO v_target_tenant_id
    FROM public.technicians
    WHERE id = p_user_id;
  END IF;

  -- Proteção Cross-Tenant
  IF v_target_tenant_id IS NOT NULL AND v_tenant_id IS DISTINCT FROM v_target_tenant_id AND v_caller_role NOT IN ('SUPER_ADMIN', 'MASTER') THEN
    RETURN json_build_object('success', false, 'error', 'Acesso negado: Tentativa de excluir usuário de outra empresa.');
  END IF;

  -- 5. EXCLUSÃO EM CASCATA

  -- A. Desvincula ordens de serviço atribuídas para manter histórico financeiro intacto
  UPDATE public.orders
  SET assigned_to = NULL
  WHERE assigned_to = p_user_id;

  -- B. Remove tokens de notificação push (se a tabela existir)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_push_tokens') THEN
    DELETE FROM public.user_push_tokens WHERE user_id = p_user_id;
  END IF;

  -- C. Remove da tabela de técnicos (por id)
  DELETE FROM public.technicians WHERE id = p_user_id;

  -- D. Remove da tabela de usuários
  DELETE FROM public.users WHERE id = p_user_id;

  -- E. Remove da tabela nativa de autenticação
  DELETE FROM auth.users WHERE id = p_user_id;

  RETURN json_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_user_cascade(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_user_cascade(UUID) TO service_role;

COMMIT;
