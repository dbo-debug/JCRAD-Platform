alter table if exists public.packaging_skus
  add column if not exists estimator_slots text[];

update public.packaging_skus
set estimator_slots = array(
  select distinct slot
  from unnest(array[
    case
      when lower(coalesce(applies_to, '')) = 'flower'
        and lower(coalesce(packaging_type, '')) in ('flower_in_bag', 'flower_in_jar')
        and coalesce(array_position(applies_to_contexts, 'flower') is not null, false)
      then 'flower_primary'
      else null
    end,
    case
      when lower(coalesce(applies_to, '')) = 'concentrate'
        and lower(coalesce(packaging_type, '')) = 'concentrate_jar'
        and coalesce(array_position(applies_to_contexts, 'concentrate') is not null, false)
      then 'concentrate_vessel'
      else null
    end,
    case
      when lower(coalesce(applies_to, '')) = 'vape'
        and lower(coalesce(packaging_type, '')) in ('vape_510_cart', 'vape_all_in_one')
        and coalesce(array_position(applies_to_contexts, 'vape') is not null, false)
      then 'vape_primary_hardware'
      else null
    end,
    case
      when lower(coalesce(applies_to, '')) in ('pre_roll', 'pre-roll', 'preroll')
        and lower(coalesce(packaging_type, '')) = 'pre_roll_tube'
        and coalesce(array_position(applies_to_contexts, 'pre_roll') is not null, false)
      then 'pre_roll_single_primary'
      else null
    end,
    case
      when lower(coalesce(applies_to, '')) in ('pre_roll', 'pre-roll', 'preroll')
        and lower(coalesce(packaging_type, '')) = 'pre_roll_jar'
        and coalesce(array_position(applies_to_contexts, 'pre_roll') is not null, false)
      then 'pre_roll_multi_primary'
      else null
    end,
    case
      when lower(coalesce(packaging_type, '')) = 'flower_in_bag'
        and abs(coalesce(size_grams, 0) - 3.5) < 0.0000001
        and coalesce(array_position(applies_to_contexts, 'concentrate') is not null, false)
      then 'concentrate_secondary_bag'
      else null
    end,
    case
      when lower(coalesce(packaging_type, '')) = 'flower_in_bag'
        and abs(coalesce(size_grams, 0) - 3.5) < 0.0000001
        and coalesce(array_position(applies_to_contexts, 'vape') is not null, false)
      then 'vape_secondary_bag'
      else null
    end,
    case
      when lower(coalesce(packaging_type, '')) = 'flower_in_bag'
        and abs(coalesce(size_grams, 0) - 3.5) < 0.0000001
        and coalesce(array_position(applies_to_contexts, 'pre_roll') is not null, false)
      then 'pre_roll_multi_secondary_bag'
      else null
    end
  ]) as slot
  where slot is not null
)
where coalesce(array_length(estimator_slots, 1), 0) = 0;

alter table if exists public.packaging_skus
  drop constraint if exists packaging_skus_estimator_slots_check;

alter table if exists public.packaging_skus
  add constraint packaging_skus_estimator_slots_check
  check (
    estimator_slots is null
    or estimator_slots <@ array[
      'flower_primary',
      'concentrate_vessel',
      'concentrate_secondary_bag',
      'vape_primary_hardware',
      'vape_secondary_bag',
      'pre_roll_single_primary',
      'pre_roll_multi_primary',
      'pre_roll_multi_secondary_bag'
    ]::text[]
  );
