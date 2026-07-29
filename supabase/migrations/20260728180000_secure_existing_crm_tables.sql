-- Security-only hardening for existing CRM, estimate, and pricing tables.
-- This migration changes privileges, row-level security, and RLS helper functions only.
-- It does not modify, backfill, reclassify, or delete application records.

begin;

create function public.is_crm_staff_rls_20260728()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and pg_catalog.lower(pg_catalog.btrim(profiles.role)) in ('admin', 'sales')
  );
$$;

create function public.is_crm_admin_rls_20260728()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and pg_catalog.lower(pg_catalog.btrim(profiles.role)) = 'admin'
  );
$$;

revoke all privileges on function public.is_crm_staff_rls_20260728() from public;
revoke all privileges on function public.is_crm_staff_rls_20260728() from anon;
revoke all privileges on function public.is_crm_admin_rls_20260728() from public;
revoke all privileges on function public.is_crm_admin_rls_20260728() from anon;
grant execute on function public.is_crm_staff_rls_20260728() to authenticated, service_role;
grant execute on function public.is_crm_admin_rls_20260728() to authenticated, service_role;

alter table public.customers enable row level security;
alter table public.customer_contacts enable row level security;
alter table public.customer_activity enable row level security;
alter table public.customer_tasks enable row level security;
alter table public.routes enable row level security;
alter table public.route_stops enable row level security;
alter table public.customer_notes enable row level security;
alter table public.route_stop_queue enable row level security;
alter table public.territories enable row level security;
alter table public.estimates enable row level security;
alter table public.estimate_lines enable row level security;
alter table public.packaging_submissions enable row level security;
alter table public.sources enable row level security;
alter table public.source_activity enable row level security;
alter table public.source_tasks enable row level security;
alter table public.products enable row level security;
alter table public.offers enable row level security;
alter table public.packaging_skus enable row level security;

revoke all privileges on table public.customers from anon, public;
revoke all privileges on table public.customer_contacts from anon, public;
revoke all privileges on table public.customer_activity from anon, public;
revoke all privileges on table public.customer_tasks from anon, public;
revoke all privileges on table public.routes from anon, public;
revoke all privileges on table public.route_stops from anon, public;
revoke all privileges on table public.customer_notes from anon, public;
revoke all privileges on table public.route_stop_queue from anon, public;
revoke all privileges on table public.territories from anon, public;
revoke all privileges on table public.estimates from anon, public;
revoke all privileges on table public.estimate_lines from anon, public;
revoke all privileges on table public.packaging_submissions from anon, public;
revoke all privileges on table public.sources from anon, public;
revoke all privileges on table public.source_activity from anon, public;
revoke all privileges on table public.source_tasks from anon, public;
revoke all privileges on table public.products from anon, public;
revoke all privileges on table public.offers from anon, public;
revoke all privileges on table public.packaging_skus from anon, public;

grant select, insert, update, delete on table public.customers to authenticated;
grant select, insert, update, delete on table public.customer_contacts to authenticated;
grant select, insert, delete on table public.customer_activity to authenticated;
grant select, insert, update, delete on table public.customer_tasks to authenticated;
grant select, insert, update, delete on table public.routes to authenticated;
grant select, insert, update, delete on table public.route_stops to authenticated;
grant select, insert, delete on table public.customer_notes to authenticated;
grant select, insert, update, delete on table public.route_stop_queue to authenticated;
grant select on table public.territories to authenticated;
grant select on table public.estimates to authenticated;
grant select on table public.estimate_lines to authenticated;
grant select on table public.packaging_submissions to authenticated;
grant select, insert, update on table public.sources to authenticated;
grant select, insert on table public.source_activity to authenticated;
grant select, insert, update on table public.source_tasks to authenticated;
grant select on table public.products to authenticated;
grant select on table public.offers to authenticated;
grant select on table public.packaging_skus to authenticated;

grant select, insert, update, delete on table public.customers to service_role;
grant select, insert, update, delete on table public.customer_contacts to service_role;
grant select, insert, update, delete on table public.customer_activity to service_role;
grant select, insert, update, delete on table public.customer_tasks to service_role;
grant select, insert, update, delete on table public.routes to service_role;
grant select, insert, update, delete on table public.route_stops to service_role;
grant select, insert, update, delete on table public.customer_notes to service_role;
grant select, insert, update, delete on table public.route_stop_queue to service_role;
grant select, insert, update, delete on table public.territories to service_role;
grant select, insert, update, delete on table public.estimates to service_role;
grant select, insert, update, delete on table public.estimate_lines to service_role;
grant select, insert, update, delete on table public.packaging_submissions to service_role;
grant select, insert, update, delete on table public.sources to service_role;
grant select, insert, update, delete on table public.source_activity to service_role;
grant select, insert, update, delete on table public.source_tasks to service_role;
grant select, insert, update, delete on table public.products to service_role;
grant select, insert, update, delete on table public.offers to service_role;
grant select, insert, update, delete on table public.packaging_skus to service_role;

-- Customer accounts and contacts.
create policy "CRM staff select customers 20260728"
  on public.customers for select to authenticated
  using (public.is_crm_staff_rls_20260728());
create policy "CRM staff insert customers 20260728"
  on public.customers for insert to authenticated
  with check (public.is_crm_staff_rls_20260728());
create policy "CRM staff update customers 20260728"
  on public.customers for update to authenticated
  using (public.is_crm_staff_rls_20260728())
  with check (public.is_crm_staff_rls_20260728());
create policy "CRM admins delete customers 20260728"
  on public.customers for delete to authenticated
  using (public.is_crm_admin_rls_20260728());

create policy "CRM staff select customer contacts 20260728"
  on public.customer_contacts for select to authenticated
  using (public.is_crm_staff_rls_20260728());
create policy "CRM staff insert customer contacts 20260728"
  on public.customer_contacts for insert to authenticated
  with check (public.is_crm_staff_rls_20260728());
create policy "CRM staff update customer contacts 20260728"
  on public.customer_contacts for update to authenticated
  using (public.is_crm_staff_rls_20260728())
  with check (public.is_crm_staff_rls_20260728());
create policy "CRM staff delete customer contacts 20260728"
  on public.customer_contacts for delete to authenticated
  using (public.is_crm_staff_rls_20260728());

-- Customer timeline, tasks, and notes.
create policy "CRM staff select customer activity 20260728"
  on public.customer_activity for select to authenticated
  using (public.is_crm_staff_rls_20260728());
create policy "CRM staff insert customer activity 20260728"
  on public.customer_activity for insert to authenticated
  with check (public.is_crm_staff_rls_20260728());
create policy "CRM admins delete customer activity 20260728"
  on public.customer_activity for delete to authenticated
  using (public.is_crm_admin_rls_20260728());

create policy "CRM staff select customer tasks 20260728"
  on public.customer_tasks for select to authenticated
  using (public.is_crm_staff_rls_20260728());
create policy "CRM staff insert customer tasks 20260728"
  on public.customer_tasks for insert to authenticated
  with check (public.is_crm_staff_rls_20260728());
create policy "CRM staff update customer tasks 20260728"
  on public.customer_tasks for update to authenticated
  using (public.is_crm_staff_rls_20260728())
  with check (public.is_crm_staff_rls_20260728());
create policy "CRM admins delete customer tasks 20260728"
  on public.customer_tasks for delete to authenticated
  using (public.is_crm_admin_rls_20260728());

create policy "CRM staff select customer notes 20260728"
  on public.customer_notes for select to authenticated
  using (public.is_crm_staff_rls_20260728());
create policy "CRM staff insert customer notes 20260728"
  on public.customer_notes for insert to authenticated
  with check (public.is_crm_staff_rls_20260728());
create policy "CRM admins delete customer notes 20260728"
  on public.customer_notes for delete to authenticated
  using (public.is_crm_admin_rls_20260728());

-- Routes, stops, private route queues, and internal territory reference data.
create policy "CRM staff select routes 20260728"
  on public.routes for select to authenticated
  using (public.is_crm_staff_rls_20260728());
create policy "CRM staff insert routes 20260728"
  on public.routes for insert to authenticated
  with check (public.is_crm_staff_rls_20260728());
create policy "CRM staff update routes 20260728"
  on public.routes for update to authenticated
  using (public.is_crm_staff_rls_20260728())
  with check (public.is_crm_staff_rls_20260728());
create policy "CRM admins delete routes 20260728"
  on public.routes for delete to authenticated
  using (public.is_crm_admin_rls_20260728());

create policy "CRM staff select route stops 20260728"
  on public.route_stops for select to authenticated
  using (public.is_crm_staff_rls_20260728());
create policy "CRM staff insert route stops 20260728"
  on public.route_stops for insert to authenticated
  with check (public.is_crm_staff_rls_20260728());
create policy "CRM staff update route stops 20260728"
  on public.route_stops for update to authenticated
  using (public.is_crm_staff_rls_20260728())
  with check (public.is_crm_staff_rls_20260728());
create policy "CRM admins delete route stops 20260728"
  on public.route_stops for delete to authenticated
  using (public.is_crm_admin_rls_20260728());

create policy "CRM staff select own route queue 20260728"
  on public.route_stop_queue for select to authenticated
  using (
    public.is_crm_staff_rls_20260728()
    and added_by_user_id = auth.uid()
  );
create policy "CRM staff insert own route queue 20260728"
  on public.route_stop_queue for insert to authenticated
  with check (
    public.is_crm_staff_rls_20260728()
    and added_by_user_id = auth.uid()
  );
create policy "CRM staff update own route queue 20260728"
  on public.route_stop_queue for update to authenticated
  using (
    public.is_crm_staff_rls_20260728()
    and added_by_user_id = auth.uid()
  )
  with check (
    public.is_crm_staff_rls_20260728()
    and added_by_user_id = auth.uid()
  );
create policy "CRM staff delete own route queue 20260728"
  on public.route_stop_queue for delete to authenticated
  using (
    public.is_crm_staff_rls_20260728()
    and added_by_user_id = auth.uid()
  );

create policy "CRM staff select territories 20260728"
  on public.territories for select to authenticated
  using (public.is_crm_staff_rls_20260728());

-- Estimates contain customer contact details, private notes, pricing, costs, and margins.
-- Authenticated customers may read only estimates matching their JWT email.
create policy "CRM staff and owners select estimates 20260728"
  on public.estimates for select to authenticated
  using (
    public.is_crm_staff_rls_20260728()
    or (
      pg_catalog.btrim(coalesce(auth.jwt() ->> 'email', '')) <> ''
      and pg_catalog.lower(pg_catalog.btrim(coalesce(customer_email, '')))
        = pg_catalog.lower(pg_catalog.btrim(coalesce(auth.jwt() ->> 'email', '')))
    )
  );

create policy "CRM staff select estimate lines 20260728"
  on public.estimate_lines for select to authenticated
  using (public.is_crm_staff_rls_20260728());

-- Packaging submissions contain customer contact details, notes, files, and review notes.
-- Authenticated customers may read only submissions matching their JWT email.
create policy "CRM staff and owners select packaging submissions 20260728"
  on public.packaging_submissions for select to authenticated
  using (
    public.is_crm_staff_rls_20260728()
    or (
      pg_catalog.btrim(coalesce(auth.jwt() ->> 'email', '')) <> ''
      and pg_catalog.lower(pg_catalog.btrim(coalesce(customer_email, '')))
        = pg_catalog.lower(pg_catalog.btrim(coalesce(auth.jwt() ->> 'email', '')))
    )
  );

-- Prospect/source workspace.
create policy "CRM staff select sources 20260728"
  on public.sources for select to authenticated
  using (public.is_crm_staff_rls_20260728());
create policy "CRM staff insert sources 20260728"
  on public.sources for insert to authenticated
  with check (public.is_crm_staff_rls_20260728());
create policy "CRM staff update sources 20260728"
  on public.sources for update to authenticated
  using (public.is_crm_staff_rls_20260728())
  with check (public.is_crm_staff_rls_20260728());

create policy "CRM staff select source activity 20260728"
  on public.source_activity for select to authenticated
  using (public.is_crm_staff_rls_20260728());
create policy "CRM staff insert source activity 20260728"
  on public.source_activity for insert to authenticated
  with check (public.is_crm_staff_rls_20260728());

create policy "CRM staff select source tasks 20260728"
  on public.source_tasks for select to authenticated
  using (public.is_crm_staff_rls_20260728());
create policy "CRM staff insert source tasks 20260728"
  on public.source_tasks for insert to authenticated
  with check (public.is_crm_staff_rls_20260728());
create policy "CRM staff update source tasks 20260728"
  on public.source_tasks for update to authenticated
  using (public.is_crm_staff_rls_20260728())
  with check (public.is_crm_staff_rls_20260728());

-- Raw product, offer, and packaging rows expose inventory and internal cost fields.
-- Public pages already obtain filtered display fields through server-only code.
create policy "CRM staff select products 20260728"
  on public.products for select to authenticated
  using (public.is_crm_staff_rls_20260728());
create policy "CRM staff select offers 20260728"
  on public.offers for select to authenticated
  using (public.is_crm_staff_rls_20260728());
create policy "CRM staff select packaging SKUs 20260728"
  on public.packaging_skus for select to authenticated
  using (public.is_crm_staff_rls_20260728());

commit;
