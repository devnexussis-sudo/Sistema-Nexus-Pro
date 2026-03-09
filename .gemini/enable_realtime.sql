-- Script SQL para habilitar Realtime no Supabase
-- Execute este script no SQL Editor do painel Supabase

-- 1. Habilitar Realtime para a tabela de Clientes
ALTER PUBLICATION supabase_realtime ADD TABLE public.customers;

-- 2. Habilitar Realtime para a tabela de Ordens de Serviço
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;

-- 3. Habilitar Realtime para a tabela de Equipamentos
ALTER PUBLICATION supabase_realtime ADD TABLE public.equipments;

-- 4. Habilitar Realtime para a tabela de Usuários
ALTER PUBLICATION supabase_realtime ADD TABLE public.users;

-- Confirmação
SELECT 'Realtime habilitado para todas as tabelas!' as status;
