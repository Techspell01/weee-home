-- Location sharing (like Life360 / Find My) for a household.
--  * Each person turns sharing on for themselves; nobody can share for someone else.
--  * Only the latest position is kept (one row per person), never a history.
--  * Saved places (home, office, a café) notify the household when someone
--    arrives or leaves, through the same `notify` Edge Function as other pushes.
--  * Turning sharing off, or leaving the household, deletes the position at once.

alter table public.household_members
  add column share_location boolean not null default false,
  add column last_seen timestamptz;

-- ---------- helpers ----------
create function public.is_sharing(p_household uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.household_members
    where household_id = p_household and user_id = (select auth.uid()) and share_location
  );
$$;
revoke execute on function public.is_sharing(uuid) from public, anon;
grant execute on function public.is_sharing(uuid) to authenticated;

-- Great-circle distance in metres between two points.
create function public.distance_m(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision
language sql immutable set search_path = ''
as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ));
$$;

-- ---------- latest position per person ----------
create table public.member_locations (
  household_id uuid not null references public.households on delete cascade,
  user_id      uuid not null default auth.uid() references auth.users on delete cascade,
  lat          double precision not null check (lat between -90 and 90),
  lng          double precision not null check (lng between -180 and 180),
  accuracy     real,
  battery      smallint check (battery between 0 and 100),
  charging     boolean,
  updated_at   timestamptz not null default now(),
  primary key (household_id, user_id)
);

alter table public.member_locations enable row level security;
create policy "members see shared locations" on public.member_locations for select to authenticated
  using (public.is_member(household_id));
create policy "share own location" on public.member_locations for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_sharing(household_id));
create policy "update own location" on public.member_locations for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.is_sharing(household_id));
create policy "remove own location" on public.member_locations for delete to authenticated
  using (user_id = (select auth.uid()));

-- Server clock decides "updated at", not the phone.
create function public.touch_location()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger member_locations_touch before insert or update on public.member_locations
  for each row execute function public.touch_location();

-- ---------- saved places ----------
create table public.places (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households on delete cascade,
  name         text not null check (char_length(name) between 1 and 60),
  lat          double precision not null check (lat between -90 and 90),
  lng          double precision not null check (lng between -180 and 180),
  radius_m     integer not null default 150 check (radius_m between 50 and 2000),
  notify       boolean not null default true,
  created_by   uuid default auth.uid() references auth.users on delete set null,
  created_at   timestamptz not null default now()
);
create index places_household_idx on public.places (household_id);

alter table public.places enable row level security;
create policy "household places" on public.places for all to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));

-- Who is inside which place right now (written only by the trigger below).
create table public.place_presence (
  place_id     uuid not null references public.places on delete cascade,
  user_id      uuid not null references auth.users on delete cascade,
  household_id uuid not null references public.households on delete cascade,
  inside       boolean not null,
  changed_at   timestamptz not null default now(),
  primary key (place_id, user_id)
);
create index place_presence_household_idx on public.place_presence (household_id);

alter table public.place_presence enable row level security;
create policy "members see who is where" on public.place_presence for select to authenticated
  using (public.is_member(household_id));

-- ---------- arrive / leave detection ----------
create function public.check_places()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  p        record;
  v_dist   double precision;
  v_prev   boolean;
  v_inside boolean;
  v_url    text;
  v_secret text;
begin
  -- Very rough fixes (wifi-only, > 500 m) would cause false alerts.
  if new.accuracy is not null and new.accuracy > 500 then
    return new;
  end if;

  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'notify_function_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_webhook_secret';

  for p in select * from public.places where household_id = new.household_id loop
    v_dist := public.distance_m(new.lat, new.lng, p.lat, p.lng);
    select inside into v_prev from public.place_presence where place_id = p.id and user_id = new.user_id;

    if v_prev is null then
      -- First position since the place was saved: record it quietly.
      insert into public.place_presence (place_id, user_id, household_id, inside)
      values (p.id, new.user_id, new.household_id, v_dist <= p.radius_m);
      continue;
    end if;

    -- Enter inside the circle; only count as "left" once clearly outside it,
    -- so GPS jitter at the edge doesn't send arrive/leave/arrive alerts.
    v_inside := case when v_prev then v_dist <= p.radius_m * 1.3 else v_dist <= p.radius_m end;

    if v_inside <> v_prev then
      update public.place_presence set inside = v_inside, changed_at = now()
      where place_id = p.id and user_id = new.user_id;

      if p.notify and v_url is not null and v_secret is not null then
        perform net.http_post(
          url := v_url,
          body := jsonb_build_object('table', 'place_event', 'record', jsonb_build_object(
            'id', p.id, 'household_id', new.household_id, 'user_id', new.user_id,
            'place', p.name, 'event', case when v_inside then 'arrived' else 'left' end)),
          headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', v_secret),
          timeout_milliseconds := 5000
        );
      end if;
    end if;
  end loop;
  return new;
end;
$$;
revoke execute on function public.check_places() from public, anon, authenticated;

create trigger member_locations_places after insert or update on public.member_locations
  for each row execute function public.check_places();

-- ---------- privacy: stop sharing / leave = forget position ----------
create function public.forget_location()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'DELETE' or (old.share_location and not new.share_location) then
    delete from public.member_locations where household_id = old.household_id and user_id = old.user_id;
    delete from public.place_presence where household_id = old.household_id and user_id = old.user_id;
  end if;
  return coalesce(new, old);
end;
$$;
revoke execute on function public.forget_location() from public, anon, authenticated;

create trigger household_members_forget_location
  after update of share_location or delete on public.household_members
  for each row execute function public.forget_location();

-- ---------- realtime ----------
alter publication supabase_realtime add table public.member_locations, public.places, public.place_presence;
