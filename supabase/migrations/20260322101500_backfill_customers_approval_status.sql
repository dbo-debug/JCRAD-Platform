update public.customers c
set approval_status = 'approved'
where c.approval_status = 'pending'
  and (
    exists (
      select 1
      from public.orders o
      where o.customer_account_id = c.id
         or o.customer_id = c.id
    )
  );

update public.customers c
set approval_status = 'needs_review'
where c.approval_status = 'pending'
  and (
    exists (
      select 1
      from public.customer_documents d
      where d.customer_account_id = c.id
    )
    or exists (
      select 1
      from public.customer_users cu
      join public.customer_documents d
        on d.user_id = cu.user_id
      where cu.customer_id = c.id
    )
  );
