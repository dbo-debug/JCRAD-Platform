alter table if exists public.catalog_items
  add column if not exists thumbnail_url text,
  add column if not exists thumbnail_bucket text,
  add column if not exists thumbnail_object_path text,
  add column if not exists video_url text,
  add column if not exists video_bucket text,
  add column if not exists video_object_path text,
  add column if not exists coa_url text,
  add column if not exists coa_bucket text,
  add column if not exists coa_object_path text;
