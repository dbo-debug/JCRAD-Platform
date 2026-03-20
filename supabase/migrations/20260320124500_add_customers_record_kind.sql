alter table if exists public.customers
  add column if not exists record_kind text not null default 'customer';

create index if not exists customers_record_kind_updated_at_idx
  on public.customers (record_kind, updated_at desc);
