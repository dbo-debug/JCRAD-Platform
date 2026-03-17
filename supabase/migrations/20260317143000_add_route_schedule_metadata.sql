alter table if exists public.routes
  add column if not exists lunch_minutes integer not null default 0,
  add column if not exists estimated_return_time timestamptz;
