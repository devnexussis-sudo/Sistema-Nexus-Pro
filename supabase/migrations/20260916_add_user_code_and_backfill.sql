-- ==============================================================================
-- MIGRATION & BACKFILL: ADICIONAR COLUNA user_code E GERAR CÓDIGOS DE 6 DÍGITOS
-- ==============================================================================
-- Instruções: Copie este script e execute no SQL Editor do Supabase Dashboard.

-- 1. Criar colunas de código se não existirem
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS user_code VARCHAR(10);
ALTER TABLE public.technicians ADD COLUMN IF NOT EXISTS tech_code VARCHAR(10);

-- 2. Criar índices para busca rápida e performance
CREATE INDEX IF NOT EXISTS idx_users_user_code ON public.users(tenant_id, user_code);
CREATE INDEX IF NOT EXISTS idx_technicians_tech_code ON public.technicians(tenant_id, tech_code);

-- 3. Bloco PL/pgSQL para preenchimento (backfill) automático dos códigos de 6 dígitos
DO $$
DECLARE
    u RECORD;
    t RECORD;
    generated_code TEXT;
    code_exists BOOLEAN;
    attempts INT;
BEGIN
    -- Etapa A: Atribuir código para todos os usuários cadastrados
    FOR u IN 
        SELECT id, tenant_id, user_code 
        FROM public.users 
        WHERE user_code IS NULL OR TRIM(user_code) = '' OR TRIM(user_code) = '---'
    LOOP
        -- Se já existir registro na tabela technicians com um tech_code válido, reaproveitar
        SELECT tech_code INTO generated_code 
        FROM public.technicians 
        WHERE id = u.id AND tech_code IS NOT NULL AND TRIM(tech_code) <> '' AND TRIM(tech_code) <> '---'
        LIMIT 1;

        IF generated_code IS NOT NULL THEN
            UPDATE public.users SET user_code = generated_code WHERE id = u.id;
        ELSE
            -- Gerar novo código numérico único de 6 dígitos
            attempts := 0;
            LOOP
                attempts := attempts + 1;
                generated_code := lpad(floor(100000 + random() * 900000)::text, 6, '0');
                
                -- Verificar se o código já está em uso em users ou technicians no mesmo tenant
                SELECT EXISTS (
                    SELECT 1 FROM public.users WHERE tenant_id = u.tenant_id AND user_code = generated_code
                    UNION ALL
                    SELECT 1 FROM public.technicians WHERE tenant_id = u.tenant_id AND tech_code = generated_code
                ) INTO code_exists;

                IF NOT code_exists OR attempts >= 50 THEN
                    EXIT;
                END IF;
            END LOOP;

            UPDATE public.users SET user_code = generated_code WHERE id = u.id;

            -- Se este usuário também estiver na tabela de técnicos, sincronizar o mesmo código
            UPDATE public.technicians 
            SET tech_code = generated_code 
            WHERE id = u.id AND (tech_code IS NULL OR TRIM(tech_code) = '' OR TRIM(tech_code) = '---');
        END IF;
    END LOOP;

    -- Etapa B: Garantir que qualquer técnico sem tech_code receba o código sincronizado ou um novo
    FOR t IN 
        SELECT id, tenant_id, tech_code 
        FROM public.technicians 
        WHERE tech_code IS NULL OR TRIM(tech_code) = '' OR TRIM(tech_code) = '---'
    LOOP
        SELECT user_code INTO generated_code 
        FROM public.users 
        WHERE id = t.id AND user_code IS NOT NULL AND TRIM(user_code) <> '' AND TRIM(user_code) <> '---'
        LIMIT 1;

        IF generated_code IS NOT NULL THEN
            UPDATE public.technicians SET tech_code = generated_code WHERE id = t.id;
        ELSE
            attempts := 0;
            LOOP
                attempts := attempts + 1;
                generated_code := lpad(floor(100000 + random() * 900000)::text, 6, '0');
                
                SELECT EXISTS (
                    SELECT 1 FROM public.users WHERE tenant_id = t.tenant_id AND user_code = generated_code
                    UNION ALL
                    SELECT 1 FROM public.technicians WHERE tenant_id = t.tenant_id AND tech_code = generated_code
                ) INTO code_exists;

                IF NOT code_exists OR attempts >= 50 THEN
                    EXIT;
                END IF;
            END LOOP;

            UPDATE public.technicians SET tech_code = generated_code WHERE id = t.id;
        END IF;
    END LOOP;
END $$;
