create table if not exists public.routes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  territory_code text references public.territories(code) on update cascade on delete set null,
  origin_name text not null,
  origin_address text not null,
  origin_latitude double precision,
  origin_longitude double precision,
  assigned_user_id uuid references public.profiles(id) on delete set null,
  route_date date,
  status text not null default 'draft',
  planned_start_time time,
  max_stops integer not null default 12,
  estimated_drive_minutes integer not null default 0,
  estimated_visit_minutes integer not null default 0,
  estimated_total_minutes integer not null default 0,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint routes_status_check check (status in ('draft', 'assigned', 'in_progress', 'completed', 'archived')),
  constraint routes_max_stops_check check (max_stops > 0 and max_stops <= 40)
);

create index if not exists routes_territory_code_idx
  on public.routes (territory_code);

create index if not exists routes_assigned_user_id_route_date_idx
  on public.routes (assigned_user_id, route_date desc nulls last);

create index if not exists routes_status_route_date_idx
  on public.routes (status, route_date desc nulls last);

create table if not exists public.route_stops (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.routes(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  stop_order integer not null,
  planned_arrival_time timestamptz,
  planned_departure_time timestamptz,
  estimated_drive_minutes_from_previous integer not null default 0,
  estimated_visit_minutes integer not null default 15,
  locked boolean not null default false,
  stop_status text not null default 'planned',
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint route_stops_unique_route_order unique (route_id, stop_order),
  constraint route_stops_unique_route_customer unique (route_id, customer_id),
  constraint route_stops_stop_status_check check (stop_status in ('planned', 'ready', 'visited', 'skipped')),
  constraint route_stops_stop_order_check check (stop_order > 0)
);

create index if not exists route_stops_route_id_stop_order_idx
  on public.route_stops (route_id, stop_order);

create index if not exists route_stops_customer_id_idx
  on public.route_stops (customer_id);

create index if not exists route_stops_stop_status_idx
  on public.route_stops (stop_status);
