-- Adiciona colunas para controle de inativação (cancelamento)
ALTER TABLE public.accounts_payable 
ADD COLUMN cancelled_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN cancelled_by UUID REFERENCES auth.users(id);

-- Opcional: index
CREATE INDEX IF NOT EXISTS idx_accounts_payable_cancelled_at ON public.accounts_payable(cancelled_at);
