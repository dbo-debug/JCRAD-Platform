insert into storage.buckets (id, name, public, file_size_limit)
values ('customer-documents', 'customer-documents', false, 26214400)
on conflict (id) do update
set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit;

-- Intentionally no storage.objects policies for this bucket.
-- The app uploads with the service-role client on the server and serves previews
-- through signed URLs generated server-side for staff/admin review flows.
