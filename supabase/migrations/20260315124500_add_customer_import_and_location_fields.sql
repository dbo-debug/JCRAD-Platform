alter table if exists public.customers
  add column if not exists stage text,
  add column if not exists address_1 text,
  add column if not exists address_2 text,
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists postal_code text,
  add column if not exists area_zone text,
  add column if not exists license_number text,
  add column if not exists main_phone text,
  add column if not exists website text,
  add column if not exists credit_rating text,
  add column if not exists tier text,
  add column if not exists house_brand boolean,
  add column if not exists last_contact_date date,
  add column if not exists next_follow_up_date date,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists geocode_source text,
  add column if not exists geocoded_at timestamptz,
  add column if not exists territory_code text,
  add column if not exists route_priority integer,
  add column if not exists import_source text,
  add column if not exists import_external_key text,
  add column if not exists last_imported_at timestamptz;

alter table if exists public.customer_contacts
  add column if not exists source text,
  add column if not exists import_notes text;
