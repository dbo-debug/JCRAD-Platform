create table if not exists public.platform_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  user_id uuid null,
  user_email text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists platform_events_created_at_idx
  on public.platform_events (created_at desc);
