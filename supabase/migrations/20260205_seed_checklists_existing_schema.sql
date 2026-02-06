
-- 1. Insert/Update Default Templates (Using Existing Schema)
-- Schema: id (text), title, fields (jsonb), tenant_id (uuid), targetType (text), targetFamily (text)

DO $$
DECLARE
  v_tenant_id UUID;
  v_template_id TEXT;
  v_rule_id TEXT;
BEGIN
  -- Seleciona o primeiro tenant ativo
  SELECT id INTO v_tenant_id FROM tenants WHERE status = 'active' LIMIT 1;
  
  IF v_tenant_id IS NOT NULL THEN
  
    -- A. Criar Template "Visita Técnica"
    v_template_id := 'tpl-default-vt-01';
    
    INSERT INTO form_templates (id, tenant_id, title, "targetType", "targetFamily", fields)
    VALUES (
      v_template_id,
      v_tenant_id, 
      'Checklist Padrão - Visita Técnica',
      'Visita Técnica', -- Mapeia para serviceTypes[0] no front
      'Todos',
      '[
        {
          "id": "f1",
          "type": "SELECT",
          "label": "Estado do Equipamento na Chegada",
          "required": true,
          "options": ["Funcionando", "Parado", "Com Ruído", "Desligado"]
        },
        {
          "id": "f2",
          "type": "PHOTO",
          "label": "Foto da Etiqueta / Serial",
          "required": true
        },
        {
          "id": "f3",
          "type": "TEXT",
          "label": "Defeito Reclamado pelo Cliente",
          "required": false
        },
        {
          "id": "f4",
          "type": "SELECT",
          "label": "Teste de Dreno Realizado?",
          "required": true,
          "options": ["Sim", "Não", "Não Aplicável"]
        },
        {
          "id": "f5",
          "type": "LONG_TEXT",
          "label": "Diagnóstico Técnico",
          "required": true
        },
        {
          "id": "f6",
          "type": "PHOTO",
          "label": "Foto do Serviço Finalizado",
          "required": false
        }
      ]'::jsonb
    )
    ON CONFLICT (id) DO UPDATE SET
      fields = EXCLUDED.fields,
      title = EXCLUDED.title;

    -- B. Criar Regra de Ativação
    -- Schema: id (text), tenant_id (uuid), service_type_id (text), equipment_family (text), form_id (text)
    
    v_rule_id := 'rule-default-vt-01';
    
    INSERT INTO activation_rules (id, tenant_id, service_type_id, equipment_family, form_id, active)
    VALUES (
      v_rule_id,
      v_tenant_id, 
      'Visita Técnica', 
      'Todos', 
      v_template_id,
      true
    )
    ON CONFLICT (id) DO NOTHING;
    
    -- Regra para Manutenção
    INSERT INTO activation_rules (id, tenant_id, service_type_id, equipment_family, form_id, active)
    VALUES (
      'rule-default-manut-01',
      v_tenant_id, 
      'Manutenção Corretiva', 
      'Todos', 
      v_template_id,
      true
    )
    ON CONFLICT (id) DO NOTHING;

  END IF;
END $$;
