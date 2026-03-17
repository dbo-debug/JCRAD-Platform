create table if not exists public.route_stop_queue (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  added_by_user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  constraint route_stop_queue_unique_customer_per_user unique (customer_id, added_by_user_id)
);

create index if not exists route_stop_queue_added_by_user_id_created_at_idx
  on public.route_stop_queue (added_by_user_id, created_at asc);

create index if not exists route_stop_queue_customer_id_idx
  on public.route_stop_queue (customer_id);
