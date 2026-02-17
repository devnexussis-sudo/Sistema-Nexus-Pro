-- 🛡️ Nexus Security Layer: Grupos de Usuários e Permissões
-- Este script cria a estrutura necessária para gestão de permissões granulares.

-- 1. Criação da tabela de Grupos
CREATE TABLE IF NOT EXISTS public.user_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
    active BOOLEAN DEFAULT true,
    is_system BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Adição de colunas na tabela de usuários para vínculo e permissões individuais
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES public.user_groups(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '{}'::jsonb;

-- 3. Habilitar RLS (Row Level Security)
ALTER TABLE public.user_groups ENABLE ROW LEVEL SECURITY;

-- 4. Políticas de Acesso (Simplificadas para o Tenant)
-- Permite que usuários vejam apenas os grupos de sua própria empresa
CREATE POLICY "Users can view their tenant groups" 
ON public.user_groups FOR SELECT 
USING (tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

-- Permite que administradores gerenciem os grupos
CREATE POLICY "Admins can manage their tenant groups" 
ON public.user_groups FOR ALL 
USING (tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid() AND role = 'ADMIN'));

-- Política para o Admin Bypass (Service Role/Super Admin Master)
CREATE POLICY "Master bypass for user_groups" 
ON public.user_groups FOR ALL 
TO service_role 
USING (true);

-- 5. Trigger para updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_user_groups_updated_at
    BEFORE UPDATE ON public.user_groups
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_user_groups_tenant_id ON public.user_groups(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_group_id ON public.users(group_id);
