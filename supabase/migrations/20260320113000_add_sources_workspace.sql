create extension if not exists pgcrypto;

create table if not exists public.sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  source_type text,
  company_name text,
  contact_name text,
  contact_email text,
  contact_phone text,
  status text default 'active',
  stage text,
  notes text,
  created_at timestamptz default timezone('utc', now()),
  updated_at timestamptz
);

create table if not exists public.source_activity (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.sources(id) on delete cascade,
  activity_type text not null,
  summary text not null,
  details jsonb not null default '{}'::jsonb,
  actor_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

alter table if exists public.source_activity
  add column if not exists source_id uuid references public.sources(id) on delete cascade,
  add column if not exists activity_type text,
  add column if not exists summary text,
  add column if not exists details jsonb not null default '{}'::jsonb,
  add column if not exists actor_user_id uuid references public.profiles(id) on delete set null,
  add column if not exists created_at timestamptz not null default timezone('utc', now());

create index if not exists source_activity_source_id_created_at_idx
  on public.source_activity (source_id, created_at desc);

create table if not exists public.source_tasks (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.sources(id) on delete cascade,
  title text not null,
  due_date date,
  assigned_user_id uuid references public.profiles(id) on delete set null,
  status text not null default 'open',
  priority integer,
  created_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz
);

alter table if exists public.source_tasks
  add column if not exists source_id uuid references public.sources(id) on delete cascade,
  add column if not exists title text,
  add column if not exists due_date date,
  add column if not exists assigned_user_id uuid references public.profiles(id) on delete set null,
  add column if not exists status text not null default 'open',
  add column if not exists priority integer,
  add column if not exists created_at timestamptz not null default timezone('utc', now()),
  add column if not exists completed_at timestamptz;

create index if not exists source_tasks_source_id_status_due_date_idx
  on public.source_tasks (source_id, status, due_date asc nulls last, created_at desc);
