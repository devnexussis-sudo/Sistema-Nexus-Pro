-- ============================================================================
-- NEXUS PRO — EXPURGO DEFINITIVO DE BASE64 & BLINDAGEM DE STORAGE (BIG TECH)
-- Arquivo: supabase/migrations/20261010_purge_base64_and_enforce_storage.sql
-- ============================================================================
-- 1. Limpa qualquer Base64 existente nas tabelas de usuários, técnicos e tenants
-- 2. Aplica restrições CHECK rígidas (tamanho máximo 2048 chars e veto a data:image)
-- 3. Cria triggers de validação preventiva no PostgreSQL
-- 4. Notifica o PostgREST para recarregar o schema
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- FASE 1: EXPURGO IMEDIATO DE REGISTROS BASE64 EXISTENTES
-- ----------------------------------------------------------------------------

-- A. Limpar avatares em Base64 na tabela users
UPDATE public.users
SET avatar = NULL
WHERE avatar ILIKE 'data:image%' 
   OR avatar ILIKE 'data:%' 
   OR length(avatar) > 2048;

-- B. Limpar avatares em Base64 na tabela technicians
UPDATE public.technicians
SET avatar = NULL
WHERE avatar ILIKE 'data:image%' 
   OR avatar ILIKE 'data:%' 
   OR length(avatar) > 2048;

-- C. Limpar logos em Base64 na tabela tenants
UPDATE public.tenants
SET logo_url = NULL
WHERE logo_url ILIKE 'data:image%' 
   OR logo_url ILIKE 'data:%' 
   OR length(logo_url) > 2048;

-- D. Limpar fotos Base64 gigantes em impedimento dentro de orders.form_data
UPDATE public.orders
SET form_data = form_data - 'impedimento_fotos' - 'impediment_photos'
WHERE form_data ? 'impedimento_fotos' 
   OR form_data ? 'impediment_photos';

-- ----------------------------------------------------------------------------
-- FASE 2: TRAVAS RÍGIDAS DE BANCO DE DADOS (CONSTRAINTS)
-- ----------------------------------------------------------------------------

-- A. Trava na tabela users
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS chk_users_avatar_no_base64;
ALTER TABLE public.users
  ADD CONSTRAINT chk_users_avatar_no_base64
  CHECK (
    avatar IS NULL 
    OR (
      avatar NOT ILIKE 'data:%' 
      AND length(avatar) <= 2048
    )
  );

-- B. Trava na tabela technicians
ALTER TABLE public.technicians DROP CONSTRAINT IF EXISTS chk_technicians_avatar_no_base64;
ALTER TABLE public.technicians
  ADD CONSTRAINT chk_technicians_avatar_no_base64
  CHECK (
    avatar IS NULL 
    OR (
      avatar NOT ILIKE 'data:%' 
      AND length(avatar) <= 2048
    )
  );

-- C. Trava na tabela tenants
ALTER TABLE public.tenants DROP CONSTRAINT IF EXISTS chk_tenants_logo_no_base64;
ALTER TABLE public.tenants
  ADD CONSTRAINT chk_tenants_logo_no_base64
  CHECK (
    logo_url IS NULL 
    OR (
      logo_url NOT ILIKE 'data:%' 
      AND length(logo_url) <= 2048
    )
  );

-- ----------------------------------------------------------------------------
-- FASE 3: TRIGGER DE SEGURANÇA UNIVERSAL ANTI-BASE64
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_block_base64_images()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Validação de avatar em users e technicians
  IF TG_TABLE_NAME IN ('users', 'technicians') THEN
    IF NEW.avatar IS NOT NULL THEN
      IF NEW.avatar ILIKE 'data:%' OR length(NEW.avatar) > 2048 THEN
        RAISE EXCEPTION 'VIOLAÇÃO DE ARQUITETURA: Imagens em Base64 são estritamente proibidas no banco de dados. Realize o upload no Storage (R2/S3) e envie apenas a URL pública.';
      END IF;
    END IF;
  END IF;

  -- Validação de logo_url em tenants
  IF TG_TABLE_NAME = 'tenants' THEN
    IF NEW.logo_url IS NOT NULL THEN
      IF NEW.logo_url ILIKE 'data:%' OR length(NEW.logo_url) > 2048 THEN
        RAISE EXCEPTION 'VIOLAÇÃO DE ARQUITETURA: Logos em Base64 são estritamente proibidas no banco de dados. Realize o upload no Storage (R2/S3) e envie apenas a URL pública.';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_base64_users ON public.users;
CREATE TRIGGER trg_block_base64_users
  BEFORE INSERT OR UPDATE OF avatar ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_block_base64_images();

DROP TRIGGER IF EXISTS trg_block_base64_technicians ON public.technicians;
CREATE TRIGGER trg_block_base64_technicians
  BEFORE INSERT OR UPDATE OF avatar ON public.technicians
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_block_base64_images();

DROP TRIGGER IF EXISTS trg_block_base64_tenants ON public.tenants;
CREATE TRIGGER trg_block_base64_tenants
  BEFORE INSERT OR UPDATE OF logo_url ON public.tenants
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_block_base64_images();

-- ----------------------------------------------------------------------------
-- FASE 4: RECARREGAMENTO DO POSTGREST
-- ----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

COMMIT;
