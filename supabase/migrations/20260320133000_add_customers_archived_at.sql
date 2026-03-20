alter table if exists public.customers
  add column if not exists archived_at timestamptz;

create index if not exists customers_record_kind_archived_at_updated_at_idx
  on public.customers (record_kind, archived_at, updated_at desc);
