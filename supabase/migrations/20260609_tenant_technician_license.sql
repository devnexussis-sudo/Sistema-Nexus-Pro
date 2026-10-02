-- =============================================================
-- NEXUS: Technician License Limit per Tenant
--
-- Adiciona o campo max_technicians na tabela tenants para que
-- o Master Admin possa controlar quantos técnicos cada empresa
-- pode cadastrar (modelo de licenciamento por usuário técnico).
--
-- Padrão: 0 = ilimitado (sem restrição de licença)
-- =============================================================

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS max_technicians INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.tenants.max_technicians
  IS 'Limite máximo de técnicos cadastrados. 0 = ilimitado.';

-- Índice não é necessário aqui pois a coluna é consultada
-- apenas na tela de cadastro (baixa frequência).
