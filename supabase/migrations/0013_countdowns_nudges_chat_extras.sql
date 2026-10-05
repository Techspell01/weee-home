-- Countdowns, "thinking of you" nudges, and chat replies / pins / reactions.

-- ---------- countdowns ----------
create table public.countdowns (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households on delete cascade,
  title        text not null check (char_length(title) between 1 and 60),
  date         date not null,
  yearly       boolean not null default false,  -- anniversaries and birthdays come round every year
  created_by   uuid default auth.uid() references auth.users on delete set null,
  created_at   timestamptz not null default now()
);
create index countdowns_household_idx on public.countdowns (household_id);
alter table public.countdowns enable row level security;
create policy "household countdowns" on public.countdowns for all to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));

-- ---------- nudges ----------
create table public.nudges (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households on delete cascade,
  from_user    uuid not null default auth.uid() references auth.users on delete cascade,
  created_at   timestamptz not null default now()
);
create index nudges_household_idx on public.nudges (household_id, created_at desc);
alter table public.nudges enable row level security;
create policy "members see nudges" on public.nudges for select to authenticated
  using (public.is_member(household_id));
create policy "send own nudges" on public.nudges for insert to authenticated
  with check (from_user = (select auth.uid()) and public.is_member(household_id));

-- No spamming (one every 3 s) and keep only a month of them.
create function public.nudge_limits()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if exists (select 1 from public.nudges where from_user = new.from_user and created_at > now() - interval '3 seconds') then
    raise exception 'One heart at a time';
  end if;
  delete from public.nudges where household_id = new.household_id and created_at < now() - interval '30 days';
  return new;
end;
$$;
revoke execute on function public.nudge_limits() from public, anon, authenticated;
create trigger nudges_limits before insert on public.nudges for each row execute function public.nudge_limits();
create trigger nudges_notify after insert on public.nudges for each row execute function public.notify_household_change();

-- ---------- chat: replies and pins ----------
alter table public.messages
  add column reply_to  uuid references public.messages on delete set null,
  add column pinned_at timestamptz,
  add column pinned_by uuid references auth.users on delete set null;

-- Members may pin/unpin any message in their chat, but can change nothing else.
revoke update on public.messages from authenticated;
grant update (pinned_at, pinned_by) on public.messages to authenticated;
create policy "members pin messages" on public.messages for update to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));

-- ---------- chat: reactions (one per person per message) ----------
create table public.message_reactions (
  message_id   uuid not null references public.messages on delete cascade,
  user_id      uuid not null default auth.uid() references auth.users on delete cascade,
  household_id uuid not null references public.households on delete cascade,
  emoji        text not null check (emoji in ('❤️', '😂', '👍', '😮', '😢', '🙏')),
  created_at   timestamptz not null default now(),
  primary key (message_id, user_id)
);
create index message_reactions_household_idx on public.message_reactions (household_id);
alter table public.message_reactions enable row level security;
create policy "members see reactions" on public.message_reactions for select to authenticated
  using (public.is_member(household_id));
create policy "react as myself" on public.message_reactions for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_member(household_id));
create policy "change my reaction" on public.message_reactions for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and public.is_member(household_id));
create policy "remove my reaction" on public.message_reactions for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------- live updates for every new table ----------
alter publication supabase_realtime add table public.countdowns, public.nudges, public.message_reactions;

-- ---------- 9 am (India time) push on a countdown's day ----------
create function public.send_countdown_reminders()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  today    date := (now() at time zone 'Asia/Kolkata')::date;
  r        record;
  v_url    text;
  v_secret text;
  v_count  integer := 0;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'notify_function_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_webhook_secret';
  for r in
    select * from public.countdowns
    where (not yearly and date = today)
       or (yearly and extract(month from date) = extract(month from today) and extract(day from date) = extract(day from today) and date <= today)
  loop
    v_count := v_count + 1;
    if v_url is not null and v_secret is not null then
      perform net.http_post(
        url := v_url,
        body := jsonb_build_object('table', 'countdown_today', 'record', jsonb_build_object(
          'id', r.id, 'household_id', r.household_id, 'title', r.title, 'yearly', r.yearly,
          'years', case when r.yearly then extract(year from today)::int - extract(year from r.date)::int end,
          'day', today)),
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', v_secret),
        timeout_milliseconds := 5000
      );
    end if;
  end loop;
  return v_count;
end;
$$;
revoke execute on function public.send_countdown_reminders() from public, anon, authenticated;
select cron.schedule('weee-countdowns', '30 3 * * *', $$select public.send_countdown_reminders()$$);
