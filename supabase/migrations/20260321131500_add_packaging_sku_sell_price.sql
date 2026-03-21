alter table if exists public.packaging_skus
  add column if not exists sell_price numeric;

alter table if exists public.packaging_skus
  drop constraint if exists packaging_skus_sell_price_check;

alter table if exists public.packaging_skus
  add constraint packaging_skus_sell_price_check
  check (sell_price is null or sell_price >= 0);
