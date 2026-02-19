-- ============================================
-- SCRIPT DE TESTE E VERIFICAÇÃO
-- Execute após a migration principal
-- ============================================

-- 1. VERIFICAR CONFIGURAÇÕES DAS EMPRESAS
-- Mostra todas as empresas e suas configurações de numeração
SELECT 
    id,
    name,
    os_prefix,
    os_start_number,
    created_at
FROM tenants
ORDER BY created_at DESC;

-- 2. VERIFICAR SE O TRIGGER ESTÁ ATIVO
SELECT 
    trigger_name, 
    event_manipulation, 
    event_object_table,
    action_statement
FROM information_schema.triggers 
WHERE event_object_table = 'orders' 
  AND trigger_name = 'trigger_set_order_id';

-- 3. TESTAR A FUNÇÃO DE GERAÇÃO DE ID
-- Substitua 'SEU-TENANT-ID-AQUI' pelo ID real da sua empresa
-- Você pode pegar o ID da query #1 acima
-- SELECT generate_order_id('SEU-TENANT-ID-AQUI'::UUID);

-- Exemplo:
-- SELECT generate_order_id('fd5421a5-c05d-48ca-9646-177ec337ac91'::UUID);

-- 4. VER ORDENS EXISTENTES E SEUS IDs
SELECT 
    o.id as order_id,
    o.title,
    o.status,
    t.name as empresa,
    t.os_prefix,
    o.createdAt
FROM orders o
LEFT JOIN tenants t ON o.tenant_id = t.id
ORDER BY o.createdAt DESC
LIMIT 20;

-- 5. CONTAR ORDENS POR EMPRESA
SELECT 
    t.name as empresa,
    t.os_prefix,
    t.os_start_number,
    COUNT(o.id) as total_ordens,
    MIN(o.id) as primeira_ordem,
    MAX(o.id) as ultima_ordem
FROM tenants t
LEFT JOIN orders o ON o.tenant_id = t.id
GROUP BY t.id, t.name, t.os_prefix, t.os_start_number
ORDER BY t.name;

-- 6. TESTE DE INSERÇÃO (OPCIONAL - CUIDADO!)
-- Descomente para testar a criação de uma ordem
-- IMPORTANTE: Substitua os valores pelos dados reais da sua empresa

/*
INSERT INTO orders (
    tenant_id,
    title,
    description,
    status,
    priority,
    customerName,
    customerAddress,
    scheduledDate,
    operationType
)
VALUES (
    'SEU-TENANT-ID-AQUI'::UUID,  -- Substitua pelo ID real
    'Teste de Numeração Automática',
    'Ordem criada para testar a geração automática de ID',
    'PENDENTE',
    'MÉDIA',
    'Cliente Teste',
    'Endereço Teste, 123',
    CURRENT_DATE,
    'Teste'
)
RETURNING id, title, tenant_id, createdAt;
*/

-- 7. VERIFICAR PRÓXIMO ID QUE SERÁ GERADO
-- Substitua 'SEU-TENANT-ID-AQUI' pelo ID real da sua empresa
/*
SELECT 
    t.name as empresa,
    t.os_prefix,
    t.os_start_number,
    COUNT(o.id) as ordens_existentes,
    t.os_start_number + COUNT(o.id) as proximo_numero,
    t.os_prefix || (t.os_start_number + COUNT(o.id))::TEXT as proximo_id
FROM tenants t
LEFT JOIN orders o ON o.tenant_id = t.id
WHERE t.id = 'SEU-TENANT-ID-AQUI'::UUID
GROUP BY t.id, t.name, t.os_prefix, t.os_start_number;
*/

-- 8. LIMPAR ORDEM DE TESTE (se você criou uma)
-- Descomente e substitua o ID da ordem de teste
-- DELETE FROM orders WHERE id = 'ID-DA-ORDEM-DE-TESTE';

-- ============================================
-- DICAS DE USO:
-- ============================================
-- 1. Execute as queries de verificação (#1 a #5) para entender o estado atual
-- 2. Use a query #3 para testar a função de geração sem inserir dados
-- 3. Se quiser testar inserção real, descomente e ajuste a query #6
-- 4. Use a query #7 para prever qual será o próximo ID
-- 5. Se criar ordem de teste, pode deletar com a query #8
