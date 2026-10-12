-- บ้านอุ่นใจ: ระบบ Admin อนุมัติประกาศ
-- รันครั้งเดียวใน Supabase > SQL Editor
-- ประกาศเดิมจะถูกตั้งเป็น approved; ประกาศใหม่จะเป็น pending

alter table public.profiles
  add column if not exists is_admin boolean not null default false;

alter table public.listings add column if not exists approval_status text;
update public.listings set approval_status = 'approved' where approval_status is null;
alter table public.listings alter column approval_status set default 'pending';
alter table public.listings alter column approval_status set not null;

do $$ begin
  alter table public.listings add constraint listings_approval_status_check
    check (approval_status in ('pending','approved','rejected'));
exception when duplicate_object then null;
end $$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select coalesce((select p.is_admin from public.profiles p
                   where p.id = (select auth.uid())), false);
$$;

create or replace function public.enforce_listing_approval()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if not public.is_admin() then
      new.approval_status := 'pending';
    end if;
  elsif new.approval_status is distinct from old.approval_status
        and not public.is_admin() then
    raise exception 'Only an admin can change listing approval status';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_listing_approval_trigger on public.listings;
create trigger enforce_listing_approval_trigger
before insert or update on public.listings
for each row execute function public.enforce_listing_approval();

create or replace function public.protect_profile_admin_flag()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  -- SQL Editor runs without an authenticated app user (auth.uid() is null),
  -- so allow trusted database-admin operations there to bootstrap the first admin.
  -- Authenticated website users still cannot grant themselves admin privileges.
  if new.is_admin is distinct from old.is_admin
     and (select auth.uid()) is not null
     and not public.is_admin() then
    raise exception 'Only an admin can change admin privileges';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_admin_flag_trigger on public.profiles;
create trigger protect_profile_admin_flag_trigger
before update on public.profiles
for each row execute function public.protect_profile_admin_flag();

drop policy if exists "listings readable by everyone" on public.listings;
drop policy if exists "listings readable: approved or admin" on public.listings;
create policy "listings readable: approved or admin" on public.listings
for select to anon, authenticated
using (
  approval_status = 'approved'
  or public.is_admin()
  or owner_id = (select auth.uid())
);

drop policy if exists "authenticated users create own listings" on public.listings;
create policy "authenticated users create own listings" on public.listings
for insert to authenticated
with check (owner_id = (select auth.uid()));

drop policy if exists "owners update own listings" on public.listings;
drop policy if exists "owners and admins update listings" on public.listings;
create policy "owners and admins update listings" on public.listings
for update to authenticated
using (owner_id = (select auth.uid()) or public.is_admin())
with check (owner_id = (select auth.uid()) or public.is_admin());

drop policy if exists "owners delete own listings" on public.listings;
drop policy if exists "owners and admins delete listings" on public.listings;
create policy "owners and admins delete listings" on public.listings
for delete to authenticated
using (owner_id = (select auth.uid()) or public.is_admin());

-- หลังรันไฟล์นี้แล้ว ให้รันคำสั่งตั้ง Admin แยกต่างหาก
