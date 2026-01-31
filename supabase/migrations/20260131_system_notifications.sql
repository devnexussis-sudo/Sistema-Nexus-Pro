-- 📢 Nexus Global Notifications System
-- Sistema para envio de avisos do Super Admin para os tenants

-- 1. Tabela de Notificações do Sistema
CREATE TABLE IF NOT EXISTS public.system_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    type TEXT DEFAULT 'broadcast', -- 'broadcast' (todos) ou 'targeted' (selecionados)
    priority TEXT DEFAULT 'info', -- 'info', 'warning', 'urgent'
    target_tenants UUID[] DEFAULT NULL, -- Array de IDs de tenants se for targeted
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Tabela de Controle de Leitura
CREATE TABLE IF NOT EXISTS public.system_notification_reads (
    notification_id UUID REFERENCES public.system_notifications(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    read_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (notification_id, user_id)
);

-- 3. RLS Policies
ALTER TABLE public.system_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_notification_reads ENABLE ROW LEVEL SECURITY;

-- Notificações: Usuários podem ver se for broadcast ou se o tenant_id deles estiver na lista
CREATE POLICY "Users can view relevant system notifications" ON public.system_notifications
    FOR SELECT
    USING (
        type = 'broadcast' 
        OR 
        (target_tenants @> ARRAY[(SELECT tenant_id FROM public.users WHERE id = auth.uid())]::uuid[])
    );

-- Leitura: Usuários podem gerenciar suas próprias marcações de leitura
CREATE POLICY "Users can manage their own notification reads" ON public.system_notification_reads
    FOR ALL
    USING (user_id = auth.uid());

-- Master/Service Role: Acesso total
CREATE POLICY "Master full access to system_notifications" ON public.system_notifications FOR ALL TO service_role USING (true);
CREATE POLICY "Master full access to system_notification_reads" ON public.system_notification_reads FOR ALL TO service_role USING (true);

-- 4. Índices
CREATE INDEX IF NOT EXISTS idx_sys_notifications_type ON public.system_notifications(type);
CREATE INDEX IF NOT EXISTS idx_sys_notif_reads_user ON public.system_notification_reads(user_id);
