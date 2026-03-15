create or replace function public.norm_text(value text)
returns text
language sql
immutable
as $$
  select nullif(lower(trim(value)), '')
$$;
