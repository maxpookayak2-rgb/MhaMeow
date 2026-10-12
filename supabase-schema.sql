-- บ้านอุ่นใจ: Supabase schema
-- วางทั้งหมดนี้ใน Supabase Dashboard > SQL Editor แล้วกด Run
create extension if not exists pgcrypto;

create table if not exists public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null default 'สมาชิกบ้านอุ่นใจ',
 created_at timestamptz not null default now()
);
create table if not exists public.listings (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 title text not null check (char_length(title) between 1 and 70),
 animal_type text not null check (animal_type in ('dog','cat')),
 province text not null check (char_length(province) between 1 and 40),
 description text not null check (char_length(description) between 1 and 1000),
 image_url text, age text, sex text, health text,
 latitude double precision, longitude double precision,
 status text not null default 'active' check (status in ('active','adopted')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists public.conversations (
 id uuid primary key default gen_random_uuid(),
 listing_id uuid not null references public.listings(id) on delete cascade,
 buyer_id uuid not null references auth.users(id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(),
 unique (listing_id, buyer_id),
 check (buyer_id <> owner_id)
);
create table if not exists public.messages (
 id uuid primary key default gen_random_uuid(),
 conversation_id uuid not null references public.conversations(id) on delete cascade,
 sender_id uuid not null references auth.users(id) on delete cascade,
 body text not null check (char_length(body) between 1 and 2000),
 created_at timestamptz not null default now()
);
create index if not exists listings_created_at_idx on public.listings(created_at desc);
create index if not exists conversations_buyer_idx on public.conversations(buyer_id, created_at desc);
create index if not exists conversations_owner_idx on public.conversations(owner_id, created_at desc);
create index if not exists messages_conversation_idx on public.messages(conversation_id, created_at);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
 insert into public.profiles (id, display_name)
 values (new.id, coalesce(nullif(new.raw_user_meta_data ->> 'display_name',''), 'สมาชิกบ้านอุ่นใจ'))
 on conflict (id) do nothing;
 return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.listings enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

drop policy if exists "profiles visible to authenticated users" on public.profiles;
create policy "profiles visible to authenticated users" on public.profiles
for select to authenticated using (true);
drop policy if exists "users insert own profile" on public.profiles;
create policy "users insert own profile" on public.profiles
for insert to authenticated with check (id = (select auth.uid()));
drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile" on public.profiles
for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

drop policy if exists "listings readable by everyone" on public.listings;
create policy "listings readable by everyone" on public.listings
for select to anon, authenticated using (true);
drop policy if exists "authenticated users create own listings" on public.listings;
create policy "authenticated users create own listings" on public.listings
for insert to authenticated with check (owner_id = (select auth.uid()));
drop policy if exists "owners update own listings" on public.listings;
create policy "owners update own listings" on public.listings
for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
drop policy if exists "owners delete own listings" on public.listings;
create policy "owners delete own listings" on public.listings
for delete to authenticated using (owner_id = (select auth.uid()));

drop policy if exists "participants read conversations" on public.conversations;
create policy "participants read conversations" on public.conversations
for select to authenticated using ((select auth.uid()) = buyer_id or (select auth.uid()) = owner_id);
drop policy if exists "buyer starts conversation with listing owner" on public.conversations;
create policy "buyer starts conversation with listing owner" on public.conversations
for insert to authenticated with check (
 buyer_id = (select auth.uid()) and buyer_id <> owner_id and
 exists (select 1 from public.listings l where l.id = listing_id and l.owner_id = owner_id)
);
drop policy if exists "participants read messages" on public.messages;
create policy "participants read messages" on public.messages
for select to authenticated using (
 exists (select 1 from public.conversations c where c.id = conversation_id
 and ((select auth.uid()) = c.buyer_id or (select auth.uid()) = c.owner_id))
);
drop policy if exists "participants send messages as themselves" on public.messages;
create policy "participants send messages as themselves" on public.messages
for insert to authenticated with check (
 sender_id = (select auth.uid()) and
 exists (select 1 from public.conversations c where c.id = conversation_id
 and ((select auth.uid()) = c.buyer_id or (select auth.uid()) = c.owner_id))
);

do $$ begin
 alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null;
when undefined_object then null;
end $$;


-- Feature updates: two-party adoption confirmation and owner-only message deletion.
alter table public.listings
 add column if not exists adoption_buyer_confirmed boolean not null default false,
 add column if not exists adoption_owner_confirmed boolean not null default false;

drop policy if exists "senders delete own messages" on public.messages;
create policy "senders delete own messages" on public.messages
for delete to authenticated using (
 sender_id = (select auth.uid()) and
 exists (select 1 from public.conversations c where c.id = conversation_id
 and ((select auth.uid()) = c.buyer_id or (select auth.uid()) = c.owner_id))
);
