-- 20260301_write_policies.sql
-- -------------------------------------------------
-- Policies de escrita (INSERT/UPDATE/DELETE) para tabelas críticas
-- Garantem que o tenant_id do usuário seja sempre validado.
-- -------------------------------------------------

-- orders
create policy "orders_write_tenant"
  on public.orders
  for insert, update, delete
  using (auth.uid() IS NOT NULL
         AND tenant_id = (select get_auth_tenant_id()));

-- users
create policy "users_write_tenant"
  on public.users
  for insert, update, delete
  using (auth.uid() IS NOT NULL
         AND tenant_id = (select get_auth_tenant_id()));

-- technicians
create policy "technicians_write_tenant"
  on public.technicians
  for insert, update, delete
  using (auth.uid() IS NOT NULL
         AND tenant_id = (select get_auth_tenant_id()));

-- user_groups
create policy "user_groups_write_tenant"
  on public.user_groups
  for insert, update, delete
  using (auth.uid() IS NOT NULL
         AND tenant_id = (select get_auth_tenant_id()));
