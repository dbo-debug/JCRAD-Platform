create table if not exists public.territories (
  code text primary key,
  name text not null,
  region_group text,
  route_day_default text,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists territories_region_group_idx
  on public.territories (region_group);

create index if not exists territories_is_active_idx
  on public.territories (is_active);

insert into public.territories (code, name, region_group, route_day_default)
values
  ('CA-FAR-NORTH', 'Far North & North Coast', 'North State', 'Monday'),
  ('CA-SAC-DELTA', 'Sacramento & Delta', 'Greater Sacramento', 'Tuesday'),
  ('CA-FOOTHILLS', 'Sierra Foothills', 'Greater Sacramento', 'Thursday'),
  ('CA-NORTH-BAY', 'North Bay', 'Bay Area', 'Monday'),
  ('CA-SF-PENINSULA', 'San Francisco & Peninsula', 'Bay Area', 'Tuesday'),
  ('CA-EAST-BAY', 'East Bay', 'Bay Area', 'Wednesday'),
  ('CA-SOUTH-BAY', 'South Bay & Santa Cruz', 'Bay Area', 'Thursday'),
  ('CA-MONTEREY-BAY', 'Monterey Bay', 'Central Coast', 'Friday'),
  ('CA-CENTRAL-VALLEY-NORTH', 'North San Joaquin Valley', 'Central Valley', 'Tuesday'),
  ('CA-CENTRAL-VALLEY-SOUTH', 'South San Joaquin Valley', 'Central Valley', 'Wednesday'),
  ('CA-CENTRAL-COAST', 'Central Coast', 'Central Coast', 'Friday'),
  ('CA-LA-CORE', 'Los Angeles Core', 'Los Angeles', 'Monday'),
  ('CA-LONG-BEACH', 'Long Beach', 'Los Angeles', 'Wednesday'),
  ('CA-SAN-GABRIEL', 'San Gabriel Valley', 'Los Angeles', 'Tuesday'),
  ('CA-SAN-FERNANDO-VALLEY', 'San Fernando Valley', 'Los Angeles', 'Thursday'),
  ('CA-ORANGE-COUNTY', 'Orange County', 'South Coast', 'Wednesday'),
  ('CA-INLAND-EMPIRE', 'Inland Empire', 'Southland', 'Thursday'),
  ('CA-SAN-DIEGO', 'San Diego', 'South Coast', 'Friday'),
  ('CA-NORTH-MENDOCINO', 'North Mendocino', 'North State', 'Tuesday'),
  ('CA-DESERT', 'Desert Cities & High Desert', 'Southland', 'Friday')
on conflict (code) do update
set
  name = excluded.name,
  region_group = excluded.region_group,
  route_day_default = excluded.route_day_default,
  is_active = true;

update public.customers
set territory_code = upper(trim(territory_code))
where territory_code is not null
  and territory_code <> upper(trim(territory_code));

update public.customers customer
set territory_code = null
where territory_code is not null
  and not exists (
    select 1
    from public.territories territory
    where territory.code = customer.territory_code
  );

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'customers_territory_code_fkey'
      and conrelid = 'public.customers'::regclass
  ) then
    alter table public.customers
      add constraint customers_territory_code_fkey
      foreign key (territory_code)
      references public.territories(code)
      on update cascade
      on delete set null;
  end if;
end
$$;
