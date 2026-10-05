-- Each person chooses which places they want arrive/leave alerts for.
-- No row = alerts on (so a new place notifies everyone until they turn it off).

create table public.place_alert_prefs (
  place_id     uuid not null references public.places on delete cascade,
  user_id      uuid not null default auth.uid() references auth.users on delete cascade,
  household_id uuid not null references public.households on delete cascade,
  enabled      boolean not null,
  primary key (place_id, user_id)
);
create index place_alert_prefs_household_idx on public.place_alert_prefs (household_id);

alter table public.place_alert_prefs enable row level security;
create policy "members see alert choices" on public.place_alert_prefs for select to authenticated
  using (public.is_member(household_id));
create policy "choose own alerts" on public.place_alert_prefs for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_member(household_id));
create policy "change own alerts" on public.place_alert_prefs for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and public.is_member(household_id));
create policy "reset own alerts" on public.place_alert_prefs for delete to authenticated
  using (user_id = (select auth.uid()));

-- Carry over the old shared switch: a place that had alerts off stays off for everyone.
insert into public.place_alert_prefs (place_id, user_id, household_id, enabled)
select p.id, m.user_id, p.household_id, false
from public.places p join public.household_members m on m.household_id = p.household_id
where not p.notify
on conflict do nothing;

-- The trigger now always reports arrivals/departures; the notify function
-- decides who hears about it from each person's choice.
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
      insert into public.place_presence (place_id, user_id, household_id, inside)
      values (p.id, new.user_id, new.household_id, v_dist <= p.radius_m);
      if v_dist <= p.radius_m then
        insert into public.place_visits (place_id, user_id, household_id) values (p.id, new.user_id, new.household_id);
      end if;
      continue;
    end if;

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

      if v_url is not null and v_secret is not null then
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

alter publication supabase_realtime add table public.place_alert_prefs;
