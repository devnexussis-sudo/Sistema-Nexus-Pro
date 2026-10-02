-- =============================================================
-- NEXUS SECURITY: Technician License Guard — Database Level
--
-- Este trigger garante que o limite de técnicos (max_technicians)
-- seja SEMPRE respeitado, mesmo que o frontend ou a API sejam
-- burlados. Proteção de segurança em camada de banco de dados.
--
-- Regras:
--   1. Ao INSERT de um técnico ATIVO, conta os técnicos ativos
--      da empresa e rejeita se atingiu max_technicians.
--   2. Ao UPDATE que mude active de false -> true (reativação),
--      aplica a mesma verificação.
--   3. Se max_technicians = 0, sem limite (plano ilimitado).
--   4. O trigger roda como SECURITY DEFINER para poder ler a
--      tabela tenants mesmo sob RLS restritivo.
-- =============================================================

-- ─── 1. FUNÇÃO DO TRIGGER ────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_check_technician_license()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER -- ignora RLS para leitura do max_technicians
SET search_path = public
AS $$
DECLARE
    v_max_technicians  INTEGER;
    v_active_count     INTEGER;
    v_company_name     TEXT;
BEGIN
    -- Só verifica se o técnico está sendo inserido/atualizado como ATIVO
    IF (TG_OP = 'INSERT' AND NEW.active = false) OR
       (TG_OP = 'UPDATE' AND NEW.active = false) OR
       (TG_OP = 'UPDATE' AND OLD.active = true AND NEW.active = true) THEN
        -- Nenhuma mudança de status relevante para o limite, permite passar
        RETURN NEW;
    END IF;

    -- Busca o limite e nome da empresa
    SELECT max_technicians, COALESCE(name, company_name, 'Empresa')
    INTO v_max_technicians, v_company_name
    FROM public.tenants
    WHERE id = NEW.tenant_id;

    -- Se max_technicians = 0 ou NULL, sem limite
    IF v_max_technicians IS NULL OR v_max_technicians = 0 THEN
        RETURN NEW;
    END IF;

    -- Conta técnicos ATIVOS desta empresa (excluindo o próprio registro se for UPDATE)
    SELECT COUNT(*)
    INTO v_active_count
    FROM public.technicians
    WHERE tenant_id = NEW.tenant_id
      AND active = true
      AND (TG_OP = 'INSERT' OR id <> NEW.id); -- no UPDATE, exclui o próprio registro

    -- Verifica se atingiu o limite
    IF v_active_count >= v_max_technicians THEN
        RAISE EXCEPTION
            'NEXUS_LICENSE_LIMIT: % já atingiu o limite de % técnico(s) ativo(s) em seu plano. Contate o suporte DUNO para upgrade.',
            v_company_name, v_max_technicians
        USING ERRCODE = 'P0001'; -- raise_exception code
    END IF;

    RETURN NEW;
END;
$$;

-- ─── 2. CRIAÇÃO DO TRIGGER ───────────────────────────────────

-- Remove se já existir (idempotente)
DROP TRIGGER IF EXISTS trg_check_technician_license ON public.technicians;

-- Dispara ANTES do INSERT e UPDATE para poder rejeitar com RAISE EXCEPTION
CREATE TRIGGER trg_check_technician_license
    BEFORE INSERT OR UPDATE OF active ON public.technicians
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_check_technician_license();

-- ─── 3. GRANTS ───────────────────────────────────────────────

-- A função usa SECURITY DEFINER, então não precisa de grants extras
-- A tabela technicians já tem as políticas RLS existentes

COMMENT ON FUNCTION public.fn_check_technician_license()
    IS 'Trigger SECURITY DEFINER que verifica o limite de licenças de técnicos (max_technicians) na tabela tenants antes de permitir INSERT/UPDATE na tabela technicians. Proteção de banco de dados contra burlamentos de API.';

NOTIFY pgrst, 'reload schema';
