alter table if exists public.packaging_skus
  add column if not exists applies_to_contexts text[];

update public.packaging_skus
set applies_to_contexts = array_remove(
  array[
    case lower(coalesce(applies_to, category, ''))
      when 'flower' then 'flower'
      when 'concentrate' then 'concentrate'
      when 'vape' then 'vape'
      when 'pre_roll' then 'pre_roll'
      when 'pre-roll' then 'pre_roll'
      when 'preroll' then 'pre_roll'
      else null
    end
  ],
  null
)
where coalesce(array_length(applies_to_contexts, 1), 0) = 0;

alter table if exists public.packaging_skus
  drop constraint if exists packaging_skus_applies_to_contexts_check;

alter table if exists public.packaging_skus
  add constraint packaging_skus_applies_to_contexts_check
  check (
    applies_to_contexts is null
    or (
      coalesce(array_length(applies_to_contexts, 1), 0) > 0
      and applies_to_contexts <@ array['flower', 'concentrate', 'vape', 'pre_roll']::text[]
    )
  );
