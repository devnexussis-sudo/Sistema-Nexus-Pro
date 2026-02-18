-- Migration: Notifications System (Push & Inbox)

-- 1. Tabela de Tokens de Push (Expo)
CREATE TABLE IF NOT EXISTS public.user_push_tokens (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    token TEXT NOT NULL,
    platform TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    tenant_id UUID, -- Opcional, para multi-tenant
    UNIQUE(user_id, token)
);

ALTER TABLE public.user_push_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own tokens" ON public.user_push_tokens
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own tokens" ON public.user_push_tokens
    FOR SELECT USING (auth.uid() = user_id);

-- 2. Tabela de Notificações (Histórico/Inbox)
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    tenant_id UUID,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    data JSONB DEFAULT '{}',
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notifications" ON public.notifications
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service Role can manage notifications" ON public.notifications
    USING (true) WITH CHECK (true);
    
-- Index for performance
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications(user_id) WHERE is_read = false;


-- 3. Função Trigger para Gerar Notificações Automáticas
CREATE OR REPLACE FUNCTION public.handle_order_notifications()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- A) NOVA OS ATRIBUÍDA (INSERT ou UPDATE de assigned_to)
    IF (TG_OP = 'INSERT' AND NEW.assigned_to IS NOT NULL) OR
       (TG_OP = 'UPDATE' AND NEW.assigned_to IS DISTINCT FROM OLD.assigned_to AND NEW.assigned_to IS NOT NULL) THEN
       
        INSERT INTO public.notifications (user_id, tenant_id, title, body, data)
        VALUES (
            NEW.assigned_to,
            NEW.tenant_id,
            'Nova OS Atribuída 🛠️', 
            'A OS #' || COALESCE(NEW.display_id, 'Nova') || ' foi atribuída a você.',
            jsonb_build_object('orderId', NEW.id, 'type', 'ASSIGNMENT')
        );
    END IF;

    -- B) ALTERAÇÃO DE HORÁRIO (Se já atribuída)
    IF (TG_OP = 'UPDATE') 
       AND NEW.assigned_to IS NOT NULL 
       AND (NEW.scheduled_date IS DISTINCT FROM OLD.scheduled_date OR NEW.scheduled_time IS DISTINCT FROM OLD.scheduled_time) THEN
       
       INSERT INTO public.notifications (user_id, tenant_id, title, body, data)
        VALUES (
            NEW.assigned_to, 
            NEW.tenant_id,
            'Alteração de Agendamento 📅', 
            'O horário da OS #' || COALESCE(NEW.display_id, '') || ' foi alterado.',
             jsonb_build_object('orderId', NEW.id, 'type', 'RESCHEDULE')
        );
    END IF;
    
    -- C) CANCELAMENTO
    IF (TG_OP = 'UPDATE') 
       AND NEW.assigned_to IS NOT NULL 
       AND NEW.status = 'CANCELED' 
       AND OLD.status != 'CANCELED' THEN
       
       INSERT INTO public.notifications (user_id, tenant_id, title, body, data)
        VALUES (
            NEW.assigned_to, 
            NEW.tenant_id,
            'OS Cancelada ❌', 
            'A OS #' || COALESCE(NEW.display_id, '') || ' foi cancelada.',
             jsonb_build_object('orderId', NEW.id, 'type', 'CANCELED')
        );
    END IF;

    RETURN NEW;
END;
$$;

-- 4. Aplicar Trigger
DROP TRIGGER IF EXISTS on_order_notification ON public.orders;
CREATE TRIGGER on_order_notification
AFTER INSERT OR UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.handle_order_notifications();
