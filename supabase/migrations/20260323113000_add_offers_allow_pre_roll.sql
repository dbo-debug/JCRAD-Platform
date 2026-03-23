alter table public.offers
  add column if not exists allow_pre_roll boolean;

update public.offers
set allow_pre_roll = true
where allow_pre_roll is null;

alter table public.offers
  alter column allow_pre_roll set default true;

alter table public.offers
  alter column allow_pre_roll set not null;
