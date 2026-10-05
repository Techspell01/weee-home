-- Replace the Map with a follow-up Tracker.
--
-- 1. Remove the location feature completely, including all stored location data
--    (positions, visits, saved places): it is no longer used, so it isn't kept.
-- 2. Add trackers: things to follow up on (job applications or anything else),
--    each with a reminder time, optional repeat, a status and a follow-up log.
-- 3. A pg_cron job checks every minute and sends a push notification to the
--    owner when a follow-up is due, even when the app is closed.

-- ---------- 1. remove location ----------
drop trigger if exists household_members_forget_location on public.household_members;
drop function if exists public.forget_location();
drop table if exists public.place_alert_prefs, public.place_visits, public.place_presence, public.member_locations, public.places cascade;
drop function if exists public.check_places();
drop function if exists public.touch_location();
drop function if exists public.is_sharing(uuid);
drop function if exists public.distance_m(double precision, double precision, double precision, double precision);
alter table public.household_members drop column if exists share_location;

-- ---------- 2. trackers ----------
create table public.trackers (
  id               uuid primary key default gen_random_uuid(),
  household_id     uuid not null references public.households on delete cascade,
  owner            uuid not null default auth.uid() references auth.users on delete cascade,
  kind             text not null default 'job' check (kind in ('job', 'other')),
  title            text not null check (char_length(title) between 1 and 100),
  details          text not null default '' check (char_length(details) <= 500),
  link             text not null default '' check (char_length(link) <= 500),
  stage            text check (stage in ('applied', 'followed_up', 'interview', 'offer', 'rejected')),
  next_at          timestamptz,                       -- next follow-up reminder
  repeat_days      integer check (repeat_days between 1 and 90),
  notified_at      timestamptz,                       -- when the reminder for next_at was sent
  followups        integer not null default 0,
  last_followup_at timestamptz,
  log              jsonb not null default '[]',       -- recent follow-ups: [{at, note}]
  done             boolean not null default false,
  shared           boolean not null default false,    -- visible to the household (only the owner edits)
  created_at       timestamptz not null default now()
);
create index trackers_household_idx on public.trackers (household_id);
create index trackers_due_idx on public.trackers (next_at) where not done and next_at is not null;

alter table public.trackers enable row level security;
create policy "see own or shared trackers" on public.trackers for select to authenticated
  using (owner = (select auth.uid()) or (shared and public.is_member(household_id)));
create policy "add own trackers" on public.trackers for insert to authenticated
  with check (owner = (select auth.uid()) and public.is_member(household_id));
create policy "edit own trackers" on public.trackers for update to authenticated
  using (owner = (select auth.uid())) with check (owner = (select auth.uid()) and public.is_member(household_id));
create policy "delete own trackers" on public.trackers for delete to authenticated
  using (owner = (select auth.uid()));

alter publication supabase_realtime add table public.trackers;

-- ---------- 3. due reminders ----------
create function public.send_due_reminders()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  r        record;
  v_url    text;
  v_secret text;
  v_count  integer := 0;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'notify_function_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_webhook_secret';

  for r in
    select * from public.trackers
    where not done and next_at is not null
      and next_at <= now() and next_at > now() - interval '1 day'
      and (notified_at is null or notified_at < next_at)
    for update skip locked
  loop
    update public.trackers set notified_at = now() where id = r.id;
    v_count := v_count + 1;
    if v_url is not null and v_secret is not null then
      perform net.http_post(
        url := v_url,
        body := jsonb_build_object('table', 'tracker_due', 'record', jsonb_build_object(
          'id', r.id, 'household_id', r.household_id, 'owner', r.owner, 'title', r.title,
          'details', r.details, 'kind', r.kind, 'stage', r.stage, 'followups', r.followups)),
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', v_secret),
        timeout_milliseconds := 5000
      );
    end if;
  end loop;
  return v_count;
end;
$$;
revoke execute on function public.send_due_reminders() from public, anon, authenticated;

create extension if not exists pg_cron;
select cron.schedule('weee-tracker-reminders', '* * * * *', $$select public.send_due_reminders()$$);
