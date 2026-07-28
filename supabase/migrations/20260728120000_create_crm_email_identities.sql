create extension if not exists pgcrypto;

create table if not exists public.crm_email_identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  email text not null,
  display_name text,
  use_for_communications boolean not null default true,
  use_for_automations boolean not null default false,
  provider text not null default 'gmail',
  gmail_connection_id uuid,
  verified_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint crm_email_identities_provider_check check (provider in ('gmail')),
  constraint crm_email_identities_email_normalized_check check (email = lower(trim(email))),
  constraint crm_email_identities_user_email_unique unique (user_id, email)
);

create unique index if not exists crm_email_identities_one_communications_default_idx
  on public.crm_email_identities (user_id)
  where use_for_communications = true;

create index if not exists crm_email_identities_automation_idx
  on public.crm_email_identities (user_id, use_for_automations)
  where use_for_automations = true;

alter table public.crm_email_identities enable row level security;

drop policy if exists "Staff can read their CRM email identities" on public.crm_email_identities;
create policy "Staff can read their CRM email identities"
  on public.crm_email_identities
  for select
  using (auth.uid() = user_id);

drop policy if exists "Staff can insert their CRM email identities" on public.crm_email_identities;
create policy "Staff can insert their CRM email identities"
  on public.crm_email_identities
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Staff can update their CRM email identities" on public.crm_email_identities;
create policy "Staff can update their CRM email identities"
  on public.crm_email_identities
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Staff can delete their CRM email identities" on public.crm_email_identities;
create policy "Staff can delete their CRM email identities"
  on public.crm_email_identities
  for delete
  using (auth.uid() = user_id);
