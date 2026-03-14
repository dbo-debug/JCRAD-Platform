alter table if exists public.profiles
  add column if not exists logo_url text,
  add column if not exists logo_bucket text,
  add column if not exists logo_object_path text;
