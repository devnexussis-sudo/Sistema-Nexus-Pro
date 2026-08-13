ALTER TABLE public.accounts_payable
ADD COLUMN IF NOT EXISTS paid_by UUID REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_accounts_payable_paid_by ON public.accounts_payable(paid_by);
