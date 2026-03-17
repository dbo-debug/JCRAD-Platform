alter table if exists public.customers
  add column if not exists geocode_status text,
  add column if not exists geocoded_address text,
  add column if not exists last_geocoded_at timestamptz,
  add column if not exists geocode_provider text;

alter table if exists public.customers
  drop constraint if exists customers_geocode_status_check;

alter table if exists public.customers
  add constraint customers_geocode_status_check
  check (geocode_status is null or geocode_status in ('geocoded', 'missing_address', 'failed', 'needs_review'));
