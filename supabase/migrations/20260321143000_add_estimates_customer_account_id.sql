alter table if exists public.estimates
  add column if not exists customer_account_id uuid references public.customers(id) on delete set null;

create index if not exists estimates_customer_account_id_idx
  on public.estimates (customer_account_id);
