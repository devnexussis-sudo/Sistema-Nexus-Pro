-- ==============================================================================
-- MIGRATION: FIX TENANT DELETION CASCADE & ATOMIC RPC MASTER (PROD SAFE)
-- Data: 2026-10-20
-- Objetivo: Blindar a integridade referencial ao excluir tenants sem travar produção:
--   1. audit_logs.tenant_id -> ON DELETE CASCADE (NOT VALID para não travar com legados)
--   2. audit_logs.changed_by -> DROP da constraint restritiva (preserva UUID sem bloquear usuários)
--   3. ai_knowledge_base.tenant_id -> ON DELETE CASCADE (NOT VALID)
--   4. users.tenant_id -> ON DELETE CASCADE (NOT VALID)
--   5. RPC atômica delete_tenant_master (Security Definer) para exclusão limpa e segura
-- ==============================================================================

BEGIN;

-- 1. AUDIT LOGS
DO $$
BEGIN
    -- audit_logs_tenant_id_fkey -> CASCADE com NOT VALID (aplica cascade sem travar em dados legados)
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'audit_logs_tenant_id_fkey' AND table_name = 'audit_logs'
    ) THEN
        ALTER TABLE public.audit_logs DROP CONSTRAINT audit_logs_tenant_id_fkey;
    END IF;

    ALTER TABLE public.audit_logs 
        ADD CONSTRAINT audit_logs_tenant_id_fkey 
        FOREIGN KEY (tenant_id) 
        REFERENCES public.tenants(id) 
        ON DELETE CASCADE NOT VALID;

    -- audit_logs_changed_by_fkey:
    -- Removemos a constraint restritiva em changed_by.
    -- Em arquitetura enterprise de telemetria/auditoria, logs devem preservar o UUID original
    -- sem depender da existência eterna do registro na tabela users (evita quebrar exclusão de contas).
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'audit_logs_changed_by_fkey' AND table_name = 'audit_logs'
    ) THEN
        ALTER TABLE public.audit_logs DROP CONSTRAINT audit_logs_changed_by_fkey;
    END IF;
END $$;


-- 2. AI KNOWLEDGE BASE: Altera constraint para CASCADE (NOT VALID)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'ai_knowledge_base_tenant_id_fkey' AND table_name = 'ai_knowledge_base'
    ) THEN
        ALTER TABLE public.ai_knowledge_base DROP CONSTRAINT ai_knowledge_base_tenant_id_fkey;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'ai_knowledge_base'
    ) THEN
        ALTER TABLE public.ai_knowledge_base 
            ADD CONSTRAINT ai_knowledge_base_tenant_id_fkey 
            FOREIGN KEY (tenant_id) 
            REFERENCES public.tenants(id) 
            ON DELETE CASCADE NOT VALID;
    END IF;
END $$;


-- 3. USERS: Altera constraint users_tenant_id_fkey para CASCADE (NOT VALID)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'users_tenant_id_fkey' AND table_name = 'users'
    ) THEN
        ALTER TABLE public.users DROP CONSTRAINT users_tenant_id_fkey;
    END IF;

    ALTER TABLE public.users 
        ADD CONSTRAINT users_tenant_id_fkey 
        FOREIGN KEY (tenant_id) 
        REFERENCES public.tenants(id) 
        ON DELETE CASCADE NOT VALID;
END $$;


-- 4. RPC ATÔMICA MASTER DE EXCLUSÃO DE TENANT (Transacional & RLS-Safe)
CREATE OR REPLACE FUNCTION public.delete_tenant_master(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_company_name text;
    v_slug text;
BEGIN
    IF p_tenant_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'ID do tenant é obrigatório.');
    END IF;

    -- Obtém dados do tenant para conferência
    SELECT COALESCE(company_name, name, 'Empresa'), slug
    INTO v_company_name, v_slug
    FROM public.tenants
    WHERE id = p_tenant_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Empresa não encontrada no banco.');
    END IF;

    -- Proteção contra exclusão acidental da instância mestre
    IF LOWER(v_slug) IN ('default', 'nexus', 'master') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Operação não permitida: A instância principal não pode ser excluída.');
    END IF;

    -- Exclusão defensiva e ordenada dos registros vinculados (ignora tabelas caso não existam)
    -- Tabelas de log e IA
    BEGIN DELETE FROM public.audit_logs WHERE tenant_id = p_tenant_id; EXCEPTION WHEN undefined_table THEN NULL; END;
    BEGIN DELETE FROM public.ai_knowledge_base WHERE tenant_id = p_tenant_id; EXCEPTION WHEN undefined_table THEN NULL; END;
    BEGIN DELETE FROM public.technician_gps_pings WHERE tenant_id = p_tenant_id; EXCEPTION WHEN undefined_table THEN NULL; END;
    BEGIN DELETE FROM public.whatsapp_messages WHERE tenant_id = p_tenant_id; EXCEPTION WHEN undefined_table THEN NULL; END;
    BEGIN DELETE FROM public.whatsapp_conversations WHERE tenant_id = p_tenant_id; EXCEPTION WHEN undefined_table THEN NULL; END;
    
    -- Operacional e Serviços
    BEGIN DELETE FROM public.service_order_equipments WHERE tenant_id = p_tenant_id; EXCEPTION WHEN undefined_table THEN NULL; END;
    BEGIN DELETE FROM public.service_visits WHERE tenant_id = p_tenant_id; EXCEPTION WHEN undefined_table THEN NULL; END;
    BEGIN DELETE FROM public.order_items WHERE tenant_id = p_tenant_id; EXCEPTION WHEN undefined_table THEN NULL; END;
    BEGIN DELETE FROM public.orders WHERE tenant_id = p_tenant_id; EXCEPTION WHEN undefined_table THEN NULL; END;
    BEGIN DELETE FROM public.quotes WHERE tenant_id = p_tenant_id; EXCEPTION WHEN undefined_table THEN NULL; END;
    
    -- Financeiro
    BEGIN DELETE FROM public.invoice_installments WHERE tenant_id = p_tenant_id; EXCEPTION WHEN undefined_table THEN NULL; END;
    BEGIN DELETE FROM public.invoice_items WHERE tenant_id = p_tenant_id; EXCEPTION WHEN undefined_table THEN NULL; END;
    BEGIN DELETE FROM public.invoices WHERE tenant_id = p_tenant_id; EXCEPTION WHEN undefined_table THEN NULL; END;
    BEGIN DELETE FROM public.accounts_payable WHERE tenant_id = p_tenant_id; EXCEPTION WHEN undefined_table THEN NULL; END;
    BEGIN DELETE FROM public.cash_flow WHERE tenant_id = p_tenant_id; EXCEPTION WHEN undefined_table THEN NULL; END;
    
    -- Cadastros e Estoque
    BEGIN DELETE FROM public.contracts WHERE tenant_id = p_tenant_id; EXCEPTION WHEN undefined_table THEN NULL; END;
    BEGIN DELETE FROM public.defect_types WHERE tenant_id = p_tenant_id; EXCEPTION WHEN undefined_table THEN NULL; END;
    BEGIN DELETE FROM public.stock_movements WHERE tenant_id = p_tenant_id; EXCEPTION WHEN undefined_table THEN NULL; END;
    BEGIN DELETE FROM public.stock_items WHERE tenant_id = p_tenant_id; EXCEPTION WHEN undefined_table THEN NULL; END;
    BEGIN DELETE FROM public.stock_categories WHERE tenant_id = p_tenant_id; EXCEPTION WHEN undefined_table THEN NULL; END;
    BEGIN DELETE FROM public.equipments WHERE tenant_id = p_tenant_id; EXCEPTION WHEN undefined_table THEN NULL; END;
    BEGIN DELETE FROM public.customers WHERE tenant_id = p_tenant_id; EXCEPTION WHEN undefined_table THEN NULL; END;
    BEGIN DELETE FROM public.form_templates WHERE tenant_id = p_tenant_id; EXCEPTION WHEN undefined_table THEN NULL; END;
    BEGIN DELETE FROM public.technicians WHERE tenant_id = p_tenant_id; EXCEPTION WHEN undefined_table THEN NULL; END;
    
    -- Grupos e Usuários (preservando Master Admins de global_admins)
    BEGIN DELETE FROM public.user_group_members WHERE group_id IN (SELECT id FROM public.user_groups WHERE tenant_id = p_tenant_id); EXCEPTION WHEN undefined_table THEN NULL; END;
    BEGIN DELETE FROM public.user_groups WHERE tenant_id = p_tenant_id; EXCEPTION WHEN undefined_table THEN NULL; END;
    BEGIN DELETE FROM public.users WHERE tenant_id = p_tenant_id AND id NOT IN (SELECT user_id FROM public.global_admins); EXCEPTION WHEN undefined_table THEN NULL; END;
    
    -- Limpa novamente quaisquer audit_logs gerados pelos triggers de DELETE anteriores
    BEGIN DELETE FROM public.audit_logs WHERE tenant_id = p_tenant_id; EXCEPTION WHEN undefined_table THEN NULL; END;
    
    -- Secrets do tenant
    BEGIN DELETE FROM public.tenant_secrets WHERE tenant_id = p_tenant_id; EXCEPTION WHEN undefined_table THEN NULL; END;
    
    -- Por fim, deleta a empresa da tabela tenants
    DELETE FROM public.tenants WHERE id = p_tenant_id;

    RETURN jsonb_build_object(
        'success', true,
        'tenant_id', p_tenant_id,
        'company_name', v_company_name
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_tenant_master(uuid) TO authenticated, service_role;

COMMIT;
