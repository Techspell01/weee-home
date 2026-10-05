-- 1. "Here for 2 h 15 min" anywhere on the map: remember where and since when
--    each person has been staying (an anchor point that only resets once they
--    move more than ~120 m away from it).
alter table public.member_locations
  add column still_since timestamptz,
  add column still_lat   double precision,
  add column still_lng   double precision;

create or replace function public.touch_location()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' or old.still_lat is null
     or public.distance_m(new.lat, new.lng, old.still_lat, old.still_lng)
        > greatest(120, least(coalesce(new.accuracy, 0), 300)) then
    new.still_since := now();
    new.still_lat := new.lat;
    new.still_lng := new.lng;
  else
    new.still_since := old.still_since;
    new.still_lat := old.still_lat;
    new.still_lng := old.still_lng;
  end if;
  return new;
end;
$$;

-- 2. Chat: delete a message just for yourself, or clear the whole chat for yourself.
--    (Unsending your own message for everyone already exists.)
alter table public.household_members add column chat_cleared_at timestamptz;

create table public.message_hides (
  message_id   uuid not null references public.messages on delete cascade,
  user_id      uuid not null default auth.uid() references auth.users on delete cascade,
  household_id uuid not null references public.households on delete cascade,
  primary key (message_id, user_id)
);

alter table public.message_hides enable row level security;
create policy "own hidden messages" on public.message_hides for select to authenticated
  using (user_id = (select auth.uid()));
create policy "hide a message for myself" on public.message_hides for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_member(household_id));
create policy "unhide" on public.message_hides for delete to authenticated
  using (user_id = (select auth.uid()));
