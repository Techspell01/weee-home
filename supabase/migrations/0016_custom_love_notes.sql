-- Your own love notes ("Baby 🥰", "Good night 🌙") beside the built-in ones,
-- and a running count of how many times each person has sent each note.

-- ---------- custom notes: each person keeps their own, only the household sees them ----------
create table public.love_notes (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households on delete cascade,
  created_by   uuid not null default auth.uid() references auth.users on delete cascade,
  emoji        text not null default '💌' check (char_length(emoji) between 1 and 16),
  text         text not null check (char_length(btrim(text)) between 1 and 40),
  created_at   timestamptz not null default now()
);
create index love_notes_household_idx on public.love_notes (household_id, created_at);
alter table public.love_notes enable row level security;
create policy "members see love notes" on public.love_notes for select to authenticated
  using (public.is_member(household_id));
create policy "add own love notes" on public.love_notes for insert to authenticated
  with check (created_by = (select auth.uid()) and public.is_member(household_id));
create policy "edit own love notes" on public.love_notes for update to authenticated
  using (created_by = (select auth.uid()))
  with check (created_by = (select auth.uid()) and public.is_member(household_id));
create policy "remove own love notes" on public.love_notes for delete to authenticated
  using (created_by = (select auth.uid()));

-- Up to 8 each, so the home card stays tidy.
create function public.love_note_limit()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (select count(*) from public.love_notes
      where household_id = new.household_id and created_by = new.created_by) >= 8 then
    raise exception 'You can keep up to 8 of your own notes';
  end if;
  return new;
end;
$$;
revoke execute on function public.love_note_limit() from public, anon, authenticated;
create trigger love_notes_limit before insert on public.love_notes
  for each row execute function public.love_note_limit();

-- ---------- a nudge can be one of your notes ----------
alter table public.nudges drop constraint nudges_kind_check;
alter table public.nudges add constraint nudges_kind_check
  check (kind in ('heart', 'love', 'miss', 'where', 'custom'));
alter table public.nudges
  add column note_id uuid references public.love_notes on delete set null,
  add column emoji   text check (char_length(emoji) <= 16),
  add column text    text check (char_length(text) <= 40);

-- The words always come from the sender's own saved note, never from the request.
create or replace function public.nudge_limits()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  note record;
begin
  if exists (select 1 from public.nudges where from_user = new.from_user and created_at > now() - interval '3 seconds') then
    raise exception 'One heart at a time';
  end if;
  if new.kind = 'custom' then
    select n.emoji, n.text into note from public.love_notes n
      where n.id = new.note_id and n.created_by = new.from_user and n.household_id = new.household_id;
    if not found then
      raise exception 'That note is not yours to send';
    end if;
    new.emoji := note.emoji;
    new.text := note.text;
  else
    new.note_id := null;
    new.emoji := null;
    new.text := null;
  end if;
  delete from public.nudges where household_id = new.household_id and created_at < now() - interval '30 days';
  return new;
end;
$$;

-- ---------- how many times each person has sent each note ----------
create table public.note_counts (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households on delete cascade,
  user_id      uuid not null references auth.users on delete cascade,
  note_key     text not null, -- heart | love | miss | where | custom:<love_notes.id>
  sent         integer not null default 0,
  last_sent_at timestamptz,
  unique (household_id, user_id, note_key)
);
alter table public.note_counts enable row level security;
create policy "members see note counts" on public.note_counts for select to authenticated
  using (public.is_member(household_id));
-- Only the trigger below writes counts.
revoke insert, update, delete on public.note_counts from anon, authenticated;

create function public.count_nudge()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.note_counts (household_id, user_id, note_key, sent, last_sent_at)
  values (new.household_id, new.from_user,
          case when new.kind = 'custom' then 'custom:' || new.note_id::text else new.kind end,
          1, new.created_at)
  on conflict (household_id, user_id, note_key)
  do update set sent = public.note_counts.sent + 1, last_sent_at = excluded.last_sent_at;
  return new;
end;
$$;
revoke execute on function public.count_nudge() from public, anon, authenticated;
create trigger nudges_count after insert on public.nudges
  for each row execute function public.count_nudge();

-- Deleting a note forgets its count.
create function public.forget_note_count()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.note_counts where household_id = old.household_id and note_key = 'custom:' || old.id::text;
  return old;
end;
$$;
revoke execute on function public.forget_note_count() from public, anon, authenticated;
create trigger love_notes_forget after delete on public.love_notes
  for each row execute function public.forget_note_count();

-- Start the counts from what is still on record (the last 30 days).
insert into public.note_counts (household_id, user_id, note_key, sent, last_sent_at)
select household_id, from_user, kind, count(*), max(created_at)
from public.nudges
group by household_id, from_user, kind;

alter publication supabase_realtime add table public.love_notes, public.note_counts;
