-- Additive-only Nameless Genetics retail sales workspace.
-- Existing unclassified customer rows remain unchanged and are treated by the application
-- as available to this owner-managed workspace. Rows explicitly tagged to another workspace
-- remain excluded.
-- Rollback is intentionally not automated: removing these additive columns/tables would discard
-- CRM history. If rollback is ever required, export the four new tables first and review every
-- dependency before preparing a separately approved cleanup migration.

create extension if not exists pgcrypto;

alter table if exists public.customers
  add column if not exists workspace_key text,
  add column if not exists legal_business_name text,
  add column if not exists dba_name text,
  add column if not exists license_type text,
  add column if not exists license_status text,
  add column if not exists instagram text,
  add column if not exists distributor text,
  add column if not exists number_of_locations integer,
  add column if not exists current_brands_carried text[],
  add column if not exists lead_source text,
  add column if not exists ownership_status text,
  add column if not exists account_submitted_by uuid references public.profiles(id) on delete set null,
  add column if not exists account_submitted_at timestamptz,
  add column if not exists ownership_verified_by uuid references public.profiles(id) on delete set null,
  add column if not exists ownership_verified_at timestamptz,
  add column if not exists ownership_notes text,
  add column if not exists commission_eligible boolean,
  add column if not exists commission_rate numeric(7,6),
  add column if not exists commission_start_date date,
  add column if not exists commission_expiration_date date;

create index if not exists customers_workspace_key_idx
  on public.customers (workspace_key);

create index if not exists customers_workspace_ownership_idx
  on public.customers (workspace_key, ownership_status);

create index if not exists customers_workspace_license_idx
  on public.customers (workspace_key, license_number);

create table if not exists public.retail_opportunities (
  id uuid primary key default gen_random_uuid(),
  workspace_key text not null default 'nameless_genetics_retail_sales',
  customer_id uuid not null references public.customers(id) on delete cascade,
  contact_id uuid references public.customer_contacts(id) on delete set null,
  name text not null,
  stage text not null default 'new_prospect',
  estimated_order_value numeric(14,2),
  probability integer,
  expected_close_date date,
  products_of_interest text[] not null default '{}'::text[],
  sample_status text,
  pricing_status text,
  next_action text,
  next_action_due_date date,
  last_activity_at timestamptz,
  owner_user_id uuid references public.profiles(id) on delete set null,
  lead_source text,
  lost_reason text,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint retail_opportunities_workspace_check check (workspace_key = 'nameless_genetics_retail_sales'),
  constraint retail_opportunities_probability_check check (probability is null or (probability >= 0 and probability <= 100)),
  constraint retail_opportunities_stage_check check (
    stage in (
      'new_prospect', 'researching', 'contact_attempted', 'buyer_contacted',
      'meeting_scheduled', 'meeting_completed', 'samples_requested', 'samples_delivered',
      'awaiting_sample_feedback', 'pricing_sent', 'order_discussed', 'order_pending',
      'first_order_placed', 'active_account', 'reorder_due', 'on_hold', 'lost', 'not_qualified'
    )
  )
);

create index if not exists retail_opportunities_customer_stage_idx
  on public.retail_opportunities (customer_id, stage, updated_at desc);

create index if not exists retail_opportunities_owner_next_action_idx
  on public.retail_opportunities (owner_user_id, next_action_due_date asc nulls last);

create table if not exists public.retail_samples (
  id uuid primary key default gen_random_uuid(),
  workspace_key text not null default 'nameless_genetics_retail_sales',
  customer_id uuid not null references public.customers(id) on delete cascade,
  contact_id uuid references public.customer_contacts(id) on delete set null,
  opportunity_id uuid references public.retail_opportunities(id) on delete set null,
  requested_at date,
  approval_status text not null default 'pending',
  products_requested text[] not null default '{}'::text[],
  quantity text,
  prepared_at date,
  delivered_at date,
  delivered_by_user_id uuid references public.profiles(id) on delete set null,
  recipient text,
  buyer_feedback text,
  feedback_at date,
  follow_up_date date,
  outcome text not null default 'pending',
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint retail_samples_workspace_check check (workspace_key = 'nameless_genetics_retail_sales'),
  constraint retail_samples_outcome_check check (
    outcome in (
      'pending', 'positive', 'neutral', 'negative', 'more_samples_requested',
      'pricing_requested', 'order_expected', 'no_response'
    )
  )
);

create index if not exists retail_samples_customer_follow_up_idx
  on public.retail_samples (customer_id, follow_up_date asc nulls last);

create index if not exists retail_samples_opportunity_idx
  on public.retail_samples (opportunity_id);

create table if not exists public.retail_sales_orders (
  id uuid primary key default gen_random_uuid(),
  workspace_key text not null default 'nameless_genetics_retail_sales',
  customer_id uuid not null references public.customers(id) on delete cascade,
  opportunity_id uuid references public.retail_opportunities(id) on delete set null,
  order_number text,
  invoice_number text,
  order_date date not null,
  invoice_date date,
  gross_sales numeric(14,2) not null default 0,
  discounts numeric(14,2) not null default 0,
  returns_credits numeric(14,2) not null default 0,
  commissionable_sales numeric(14,2) generated always as (
    greatest(gross_sales - discounts - returns_credits, 0)
  ) stored,
  commission_rate numeric(7,6) not null default 0.05,
  estimated_commission numeric(14,2) generated always as (
    round(greatest(gross_sales - discounts - returns_credits, 0) * commission_rate, 2)
  ) stored,
  payment_collection_status text,
  commission_approval_status text,
  commission_payment_status text,
  commission_status text not null default 'estimated',
  commission_paid_at date,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint retail_sales_orders_workspace_check check (workspace_key = 'nameless_genetics_retail_sales'),
  constraint retail_sales_orders_commission_rate_check check (commission_rate >= 0 and commission_rate <= 1),
  constraint retail_sales_orders_commission_status_check check (
    commission_status in (
      'estimated', 'awaiting_invoice', 'awaiting_customer_payment', 'eligible',
      'approved', 'paid', 'disputed', 'not_eligible'
    )
  )
);

create index if not exists retail_sales_orders_customer_date_idx
  on public.retail_sales_orders (customer_id, order_date desc);

create index if not exists retail_sales_orders_commission_status_idx
  on public.retail_sales_orders (commission_status, order_date desc);

alter table if exists public.customer_activity
  add column if not exists contact_id uuid references public.customer_contacts(id) on delete set null,
  add column if not exists opportunity_id uuid references public.retail_opportunities(id) on delete set null,
  add column if not exists occurred_at timestamptz,
  add column if not exists outcome text,
  add column if not exists next_action text,
  add column if not exists next_action_date date;

create index if not exists customer_activity_opportunity_created_idx
  on public.customer_activity (opportunity_id, created_at desc);

create table if not exists public.route_stop_sales_outcomes (
  id uuid primary key default gen_random_uuid(),
  workspace_key text not null default 'nameless_genetics_retail_sales',
  route_stop_id uuid not null references public.route_stops(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  field_status text not null default 'planned',
  buyer_present boolean not null default false,
  buyer_reached boolean not null default false,
  meeting_scheduled boolean not null default false,
  samples_delivered boolean not null default false,
  sales_materials_delivered boolean not null default false,
  follow_up_created boolean not null default false,
  opportunity_advanced boolean not null default false,
  order_generated boolean not null default false,
  visit_notes text,
  rescheduled_for date,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint route_stop_sales_outcomes_workspace_check check (workspace_key = 'nameless_genetics_retail_sales'),
  constraint route_stop_sales_outcomes_status_check check (
    field_status in ('planned', 'visited', 'skipped', 'closed', 'rescheduled')
  ),
  constraint route_stop_sales_outcomes_route_stop_unique unique (route_stop_id)
);

create index if not exists route_stop_sales_outcomes_customer_idx
  on public.route_stop_sales_outcomes (customer_id, updated_at desc);

alter table public.retail_opportunities enable row level security;
alter table public.retail_samples enable row level security;
alter table public.retail_sales_orders enable row level security;
alter table public.route_stop_sales_outcomes enable row level security;

create policy "Nameless staff can manage retail opportunities"
  on public.retail_opportunities
  for all
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and lower(profiles.role) in ('admin', 'sales')
    )
  )
  with check (
    workspace_key = 'nameless_genetics_retail_sales'
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and lower(profiles.role) in ('admin', 'sales')
    )
  );

create policy "Nameless staff can manage retail samples"
  on public.retail_samples
  for all
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and lower(profiles.role) in ('admin', 'sales')
    )
  )
  with check (
    workspace_key = 'nameless_genetics_retail_sales'
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and lower(profiles.role) in ('admin', 'sales')
    )
  );

create policy "Nameless staff can manage retail sales orders"
  on public.retail_sales_orders
  for all
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and lower(profiles.role) in ('admin', 'sales')
    )
  )
  with check (
    workspace_key = 'nameless_genetics_retail_sales'
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and lower(profiles.role) in ('admin', 'sales')
    )
  );

create policy "Nameless staff can manage route stop sales outcomes"
  on public.route_stop_sales_outcomes
  for all
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and lower(profiles.role) in ('admin', 'sales')
    )
  )
  with check (
    workspace_key = 'nameless_genetics_retail_sales'
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and lower(profiles.role) in ('admin', 'sales')
    )
  );

comment on table public.retail_sales_orders is
  'Operational Nameless retail sales commission estimates only; not accounting, payroll, or guaranteed income.';
