-- Homelist schema: households joined by invite code, with a shared shopping
-- list, pantry stock tracking, chores and expense splits.
-- Every row belongs to a household; RLS lets only its members see or change it.

-- ---------- tables ----------
create table public.households (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 60),
  invite_code text not null unique,
  created_by  uuid default auth.uid() references auth.users on delete set null,
  created_at  timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households on delete cascade,
  user_id      uuid not null references auth.users on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  joined_at    timestamptz not null default now(),
  primary key (household_id, user_id)
);
create index household_members_user_idx on public.household_members (user_id);

create table public.items (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households on delete cascade,
  name         text not null check (char_length(name) between 1 and 80),
  qty          text not null default '' check (char_length(qty) <= 30),
  category     text not null default 'other',
  status       text not null default 'need' check (status in ('need', 'bought')),
  urgent       boolean not null default false,
  added_by     uuid default auth.uid() references auth.users on delete set null,
  added_at     timestamptz not null default now(),
  bought_by    uuid references auth.users on delete set null,
  bought_at    timestamptz
);
create index items_household_idx on public.items (household_id);

create table public.pantry (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households on delete cascade,
  key          text not null,               -- normalised name, one row per product
  name         text not null,
  category     text not null default 'other',
  last_bought  timestamptz,
  lasts_days   integer not null default 14 check (lasts_days between 1 and 365),
  purchases    timestamptz[] not null default '{}',  -- last 8 purchase times, oldest first
  unique (household_id, key)
);

create table public.chores (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households on delete cascade,
  title        text not null check (char_length(title) between 1 and 80),
  every_days   integer not null default 7 check (every_days between 1 and 365),
  assignee     uuid references auth.users on delete set null,
  created_at   timestamptz not null default now(),
  last_done    timestamptz,
  done_by      uuid references auth.users on delete set null
);
create index chores_household_idx on public.chores (household_id);

create table public.expenses (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households on delete cascade,
  description   text not null check (char_length(description) between 1 and 80),
  amount        numeric(12, 2) not null check (amount > 0),
  paid_by       uuid not null references auth.users on delete cascade,
  split_with    uuid[] not null check (cardinality(split_with) > 0),
  is_settlement boolean not null default false,
  created_by    uuid default auth.uid() references auth.users on delete set null,
  created_at    timestamptz not null default now()
);
create index expenses_household_idx on public.expenses (household_id);

-- ---------- membership helper ----------
create function public.is_member(p_household uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.household_members
    where household_id = p_household and user_id = (select auth.uid())
  );
$$;

-- ---------- row level security ----------
alter table public.households        enable row level security;
alter table public.household_members enable row level security;
alter table public.items             enable row level security;
alter table public.pantry            enable row level security;
alter table public.chores            enable row level security;
alter table public.expenses          enable row level security;

-- households and memberships are created only through the functions below
create policy "members read household"   on public.households for select to authenticated using (public.is_member(id));
create policy "members rename household" on public.households for update to authenticated using (public.is_member(id)) with check (public.is_member(id));

create policy "members see each other" on public.household_members for select to authenticated using (public.is_member(household_id));
create policy "edit own member row"    on public.household_members for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "leave household"        on public.household_members for delete to authenticated using (user_id = (select auth.uid()));

create policy "household items"    on public.items    for all to authenticated using (public.is_member(household_id)) with check (public.is_member(household_id));
create policy "household pantry"   on public.pantry   for all to authenticated using (public.is_member(household_id)) with check (public.is_member(household_id));
create policy "household chores"   on public.chores   for all to authenticated using (public.is_member(household_id)) with check (public.is_member(household_id));
create policy "household expenses" on public.expenses for all to authenticated using (public.is_member(household_id)) with check (public.is_member(household_id));

-- ---------- functions ----------
create function public.create_household(p_name text, p_display_name text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id   uuid;
  v_code text;
begin
  if (select auth.uid()) is null then raise exception 'Sign in first'; end if;
  loop
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    exit when not exists (select 1 from public.households where invite_code = v_code);
  end loop;
  insert into public.households (name, invite_code) values (btrim(p_name), v_code) returning id into v_id;
  insert into public.household_members (household_id, user_id, display_name)
  values (v_id, (select auth.uid()), btrim(p_display_name));
  return v_id;
end;
$$;

create function public.join_household(p_code text, p_display_name text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'Sign in first'; end if;
  select id into v_id from public.households where invite_code = upper(btrim(p_code));
  if v_id is null then raise exception 'No household uses that invite code'; end if;
  insert into public.household_members (household_id, user_id, display_name)
  values (v_id, (select auth.uid()), btrim(p_display_name))
  on conflict (household_id, user_id) do update set display_name = excluded.display_name;
  return v_id;
end;
$$;

-- Records that a product was bought and learns how long it lasts from the
-- average gap between the household's recent purchases.
create function public.record_purchase(
  p_household     uuid,
  p_name          text,
  p_category      text default 'other',
  p_default_days  integer default 14,
  p_override_days integer default null
)
returns void
language plpgsql security invoker set search_path = ''
as $$
declare
  v_key       text := lower(regexp_replace(btrim(p_name), '\s+', ' ', 'g'));
  v_row       public.pantry%rowtype;
  v_purchases timestamptz[];
  v_n         integer;
  v_days      integer;
  v_avg       numeric;
begin
  if not public.is_member(p_household) then raise exception 'You are not in this household'; end if;

  select * into v_row from public.pantry
  where household_id = p_household and key = v_key
  for update;

  if not found then
    insert into public.pantry (household_id, key, name, category, last_bought, lasts_days, purchases)
    values (p_household, v_key, btrim(p_name), coalesce(p_category, 'other'), now(),
            least(365, greatest(1, coalesce(p_override_days, p_default_days, 14))), array[now()])
    on conflict (household_id, key) do update set last_bought = now();
    return;
  end if;

  v_purchases := v_row.purchases || now();
  v_n := cardinality(v_purchases);
  if v_n > 8 then
    v_purchases := v_purchases[v_n - 7 : v_n];
    v_n := 8;
  end if;

  v_days := v_row.lasts_days;
  if p_override_days is not null then
    v_days := p_override_days;
  elsif v_n >= 3 then
    v_avg := extract(epoch from (v_purchases[v_n] - v_purchases[1])) / 86400.0 / (v_n - 1);
    if v_avg >= 0.5 then v_days := round(v_avg); end if;
  end if;

  update public.pantry
  set last_bought = now(), purchases = v_purchases, lasts_days = least(365, greatest(1, v_days))
  where id = v_row.id;
end;
$$;

revoke execute on function public.is_member(uuid)                                  from public, anon;
revoke execute on function public.create_household(text, text)                     from public, anon;
revoke execute on function public.join_household(text, text)                       from public, anon;
revoke execute on function public.record_purchase(uuid, text, text, integer, integer) from public, anon;
grant  execute on function public.is_member(uuid)                                  to authenticated;
grant  execute on function public.create_household(text, text)                     to authenticated;
grant  execute on function public.join_household(text, text)                       to authenticated;
grant  execute on function public.record_purchase(uuid, text, text, integer, integer) to authenticated;

-- ---------- realtime ----------
alter publication supabase_realtime add table
  public.household_members, public.items, public.pantry, public.chores, public.expenses;
