
-- 1. Create Form Templates Table
CREATE TABLE IF NOT EXISTS form_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES tenants(id),
  title TEXT NOT NULL,
  description TEXT,
  fields JSONB DEFAULT '[]'::jsonb, -- Array of FormField objects
  service_types JSONB DEFAULT '[]'::jsonb, -- Array of strings (service names) for direct fallback matching
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Policies for Form Templates
ALTER TABLE form_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view form_templates in same tenant" ON form_templates
  FOR SELECT USING (tenant_id = get_current_tenant_id());

CREATE POLICY "Users can insert form_templates in same tenant" ON form_templates
  FOR INSERT WITH CHECK (tenant_id = get_current_tenant_id());

CREATE POLICY "Users can update form_templates in same tenant" ON form_templates
  FOR UPDATE USING (tenant_id = get_current_tenant_id());

CREATE POLICY "Users can delete form_templates in same tenant" ON form_templates
  FOR DELETE USING (tenant_id = get_current_tenant_id());


-- 2. Create Activation Rules Table
CREATE TABLE IF NOT EXISTS activation_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES tenants(id),
  service_type TEXT NOT NULL, -- "Visita Técnica", "Instalação", etc.
  equipment_family TEXT, -- "Ar Condicionado", "Refrigeração", etc. (nullable)
  form_template_id UUID REFERENCES form_templates(id),
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Policies for Activation Rules
ALTER TABLE activation_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view activation_rules in same tenant" ON activation_rules
  FOR SELECT USING (tenant_id = get_current_tenant_id());

CREATE POLICY "Users can insert activation_rules in same tenant" ON activation_rules
  FOR INSERT WITH CHECK (tenant_id = get_current_tenant_id());

CREATE POLICY "Users can update activation_rules in same tenant" ON activation_rules
  FOR UPDATE USING (tenant_id = get_current_tenant_id());

CREATE POLICY "Users can delete activation_rules in same tenant" ON activation_rules
  FOR DELETE USING (tenant_id = get_current_tenant_id());

-- 3. SEED DATA (Exemplo para teste imediato)
-- Cria um template padrão para "Visita Técnica" para o primeiro tenant encontrado
DO $$
DECLARE
  v_tenant_id UUID;
  v_template_id UUID;
BEGIN
  SELECT id INTO v_tenant_id FROM tenants LIMIT 1;
  
  IF v_tenant_id IS NOT NULL THEN
    -- Inserir Template Default
    INSERT INTO form_templates (tenant_id, title, service_types, fields)
    VALUES (
      v_tenant_id, 
      'Checklist Padrão - Visita Técnica',
      '["Visita Técnica", "Manutenção Corretiva"]',
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
    RETURNING id INTO v_template_id;

    -- Inserir Regra de Ativação
    INSERT INTO activation_rules (tenant_id, service_type, form_template_id)
    VALUES (v_tenant_id, 'Visita Técnica', v_template_id);
    
    INSERT INTO activation_rules (tenant_id, service_type, form_template_id)
    VALUES (v_tenant_id, 'Manutenção Corretiva', v_template_id);
    
  END IF;
END $$;
