-- Movement (speed + walking/driving) and time spent at saved places.

alter table public.member_locations
  add column speed    real check (speed >= 0),          -- metres per second
  add column heading  real check (heading between 0 and 360),
  add column activity text check (activity in ('still', 'walking', 'cycling', 'driving'));

-- One row per stay at a saved place: arrived, and left (null while still there).
-- Kept for 30 days.
create table public.place_visits (
  id           uuid primary key default gen_random_uuid(),
  place_id     uuid not null references public.places on delete cascade,
  user_id      uuid not null references auth.users on delete cascade,
  household_id uuid not null references public.households on delete cascade,
  arrived_at   timestamptz not null default now(),
  left_at      timestamptz
);
create index place_visits_household_idx on public.place_visits (household_id, arrived_at desc);
create index place_visits_open_idx on public.place_visits (place_id, user_id) where left_at is null;

alter table public.place_visits enable row level security;
create policy "members see visits" on public.place_visits for select to authenticated
  using (public.is_member(household_id));

-- Arrive / leave detection, now also recording visits and how long they lasted.
create or replace function public.check_places()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  p          record;
  v_dist     double precision;
  v_prev     boolean;
  v_since    timestamptz;
  v_inside   boolean;
  v_minutes  integer;
  v_url      text;
  v_secret   text;
begin
  if new.accuracy is not null and new.accuracy > 500 then
    return new;
  end if;

  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'notify_function_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_webhook_secret';

  for p in select * from public.places where household_id = new.household_id loop
    v_dist := public.distance_m(new.lat, new.lng, p.lat, p.lng);
    select inside, changed_at into v_prev, v_since from public.place_presence where place_id = p.id and user_id = new.user_id;

    if v_prev is null then
      -- First position since the place was saved: record it quietly.
      insert into public.place_presence (place_id, user_id, household_id, inside)
      values (p.id, new.user_id, new.household_id, v_dist <= p.radius_m);
      if v_dist <= p.radius_m then
        insert into public.place_visits (place_id, user_id, household_id) values (p.id, new.user_id, new.household_id);
      end if;
      continue;
    end if;

    -- Enter inside the circle; only count as "left" once clearly outside it.
    v_inside := case when v_prev then v_dist <= p.radius_m * 1.3 else v_dist <= p.radius_m end;

    if v_inside <> v_prev then
      update public.place_presence set inside = v_inside, changed_at = now()
      where place_id = p.id and user_id = new.user_id;

      if v_inside then
        insert into public.place_visits (place_id, user_id, household_id) values (p.id, new.user_id, new.household_id);
        v_minutes := null;
      else
        update public.place_visits set left_at = now()
        where place_id = p.id and user_id = new.user_id and left_at is null;
        v_minutes := greatest(0, round(extract(epoch from (now() - v_since)) / 60));
      end if;

      if p.notify and v_url is not null and v_secret is not null then
        perform net.http_post(
          url := v_url,
          body := jsonb_build_object('table', 'place_event', 'record', jsonb_build_object(
            'id', p.id, 'household_id', new.household_id, 'user_id', new.user_id,
            'place', p.name, 'event', case when v_inside then 'arrived' else 'left' end,
            'minutes', v_minutes)),
          headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', v_secret),
          timeout_milliseconds := 5000
        );
      end if;
    end if;
  end loop;

  delete from public.place_visits
  where household_id = new.household_id and user_id = new.user_id and arrived_at < now() - interval '30 days';
  return new;
end;
$$;

-- Turning sharing off or leaving also closes any open visit.
create or replace function public.forget_location()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'DELETE' or (old.share_location and not new.share_location) then
    update public.place_visits set left_at = now()
    where household_id = old.household_id and user_id = old.user_id and left_at is null;
    delete from public.member_locations where household_id = old.household_id and user_id = old.user_id;
    delete from public.place_presence where household_id = old.household_id and user_id = old.user_id;
  end if;
  return coalesce(new, old);
end;
$$;

alter publication supabase_realtime add table public.place_visits;
