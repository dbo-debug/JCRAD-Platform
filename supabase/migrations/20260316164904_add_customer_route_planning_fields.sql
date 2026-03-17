alter table if exists public.customers
  add column if not exists route_day text,
  add column if not exists last_visit_at timestamptz,
  add column if not exists next_visit_due_at timestamptz,
  add column if not exists visit_status text,
  add column if not exists assigned_route_rep_user_id uuid references public.profiles(id) on delete set null;

create index if not exists customers_route_day_idx
  on public.customers (route_day);

create index if not exists customers_assigned_route_rep_user_id_idx
  on public.customers (assigned_route_rep_user_id);

create index if not exists customers_visit_status_next_visit_due_at_idx
  on public.customers (visit_status, next_visit_due_at desc nulls last);
