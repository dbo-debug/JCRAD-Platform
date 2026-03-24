insert into storage.buckets (id, name, public)
values ('customer-documents', 'customer-documents', false)
on conflict (id) do update
set
  name = excluded.name,
  public = excluded.public;

-- Intentionally no storage.objects policies for this bucket.
-- The app uploads with the service-role client on the server and serves previews
-- through signed URLs generated server-side for staff/admin review flows.
