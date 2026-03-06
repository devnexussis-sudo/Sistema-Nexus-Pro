-- ════════════════════════════════════════════════════════════════════
-- Nexus Pro — Funções SECURITY DEFINER para edição de equipamentos na OS
-- Evita bloqueios de RLS silenciosos no UPDATE e garantem consistência.
-- ════════════════════════════════════════════════════════════════════

BEGIN;

DROP FUNCTION IF EXISTS public.nexus_remove_equipment_from_order(UUID, UUID);

CREATE OR REPLACE FUNCTION public.nexus_remove_equipment_from_order(
    p_equipment_entry_id UUID,
    p_tenant_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.service_order_equipments
    SET deleted_at = NOW(),
        updated_at = NOW()
    WHERE id = p_equipment_entry_id
      AND tenant_id = p_tenant_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.nexus_remove_equipment_from_order(UUID, UUID)
    TO authenticated, anon;


DROP FUNCTION IF EXISTS public.nexus_update_equipment_form_id(UUID, UUID, UUID);

CREATE OR REPLACE FUNCTION public.nexus_update_equipment_form_id(
    p_equipment_entry_id UUID,
    p_form_id UUID,
    p_tenant_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.service_order_equipments
    SET form_id = p_form_id,
        updated_at = NOW()
    WHERE id = p_equipment_entry_id
      AND tenant_id = p_tenant_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.nexus_update_equipment_form_id(UUID, UUID, UUID)
    TO authenticated, anon;

NOTIFY pgrst, 'reload schema';

COMMIT;
