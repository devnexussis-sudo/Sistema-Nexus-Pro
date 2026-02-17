-- =====================================================================================
-- NEXUS PRO - FIX USER GROUPS & PERMISSIONS
-- =====================================================================================
-- Data: 2026-02-09
-- Descrição: Cria a tabela user_groups faltante para corrigir erro 404 no módulo de Usuários.

-- 1. Criar tabela de GRUPOS DE USUÁRIOS
CREATE TABLE IF NOT EXISTS public.user_groups (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
    name text NOT NULL,
    description text,
    permissions jsonb DEFAULT '{}'::jsonb,
    is_system boolean DEFAULT false,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 2. Habilitar RLS
ALTER TABLE public.user_groups ENABLE ROW LEVEL SECURITY;

-- 3. Criar Política de Isolamento
CREATE POLICY "tenant_user_groups" ON public.user_groups FOR ALL USING (tenant_id = public.get_user_tenant_id());

-- 4. Dar Permissões
GRANT ALL ON TABLE public.user_groups TO authenticated;

-- 5. Seed de Grupos Padrão (Exemplo para o tenant inicial)
DO $$
DECLARE
    v_tenant_id uuid;
BEGIN
    SELECT id INTO v_tenant_id FROM public.tenants WHERE slug = 'nexus-corp' LIMIT 1;
    
    IF v_tenant_id IS NOT NULL THEN
        INSERT INTO public.user_groups (tenant_id, name, description, is_system, permissions)
        VALUES 
            (v_tenant_id, 'Administradores', 'Controle total do sistema', true, '{"admin": true}'),
            (v_tenant_id, 'Técnicos', 'Acesso operacional e mobile', true, '{"mobile": true}'),
            (v_tenant_id, 'Operadores', 'Acesso básico de atendimento', true, '{"support": true}')
        ON CONFLICT DO NOTHING; -- Evita duplicação se rodar 2x
    END IF;
END $$;

-- 6. Recarregar Schema Cache
NOTIFY pgrst, 'reload schema';
