alter table if exists public.customers
  add column if not exists approval_status text not null default 'pending';

alter table if exists public.customers
  drop constraint if exists customers_approval_status_check;

alter table if exists public.customers
  add constraint customers_approval_status_check
  check (approval_status in ('pending', 'approved', 'needs_review', 'follow_up', 'rejected'));

create index if not exists customers_approval_status_updated_at_idx
  on public.customers (approval_status, updated_at desc);
