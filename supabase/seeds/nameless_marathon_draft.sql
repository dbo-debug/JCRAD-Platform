-- Optional draft seed. Run manually only after reviewing and applying the Nameless workspace migration.
-- No buyer or licensing information is fabricated.

insert into public.customers (
  workspace_key,
  company_name,
  dba_name,
  territory_code,
  area_zone,
  source,
  lead_source,
  ownership_status,
  commission_eligible,
  commission_rate,
  status,
  stage,
  next_follow_up_date,
  import_notes
)
select
  'nameless_genetics_retail_sales',
  'Marathon',
  'Marathon',
  'san_fernando_valley',
  'San Fernando Valley',
  'in_person_retail_outreach',
  'In-person retail outreach',
  'unverified',
  false,
  0.05,
  'prospect',
  'meeting_scheduled',
  null,
  'DRAFT — Meeting was generated during independent store outreach on July 28, 2026. Nameless Genetics and Kilo & Co. opportunities must be tracked separately.'
where not exists (
  select 1
  from public.customers
  where workspace_key = 'nameless_genetics_retail_sales'
    and lower(trim(coalesce(dba_name, company_name, ''))) = 'marathon'
);
