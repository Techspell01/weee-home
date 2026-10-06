-- Games replace the Tracker: Tic Tac Toe, Four in a Row, Rock Paper Scissors
-- and This or That, played live between the two of you.

-- ---------- the Tracker goes (it was empty) ----------
select cron.unschedule('weee-tracker-reminders');
drop function public.send_due_reminders();
drop table public.trackers; -- also drops its policies, triggers and realtime entry
drop function public.rearm_tracker_reminder();

-- ---------- which game someone has open, so moves don't buzz a phone that's already looking ----------
alter table public.household_members
  add column watching_game uuid,
  add column watching_at   timestamptz;

-- ---------- games ----------
create table public.games (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households on delete cascade,
  kind         text not null check (kind in ('tictactoe', 'connect4', 'rps', 'thisorthat')),
  created_by   uuid not null default auth.uid() references auth.users on delete cascade,
  opponent     uuid not null references auth.users on delete cascade,
  turn         uuid,                 -- whose move (turn-based games); null for pick games
  round        integer not null default 1,
  state        jsonb not null default '{}'::jsonb,
  status       text not null default 'active' check (status in ('active', 'done')),
  winner       uuid,                 -- null when done = a draw (or This or That)
  last_actor   uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (opponent <> created_by)
);
create index games_household_idx on public.games (household_id, created_at desc);
-- One game of each kind at a time, so two people tapping "Play" together land in the same game.
create unique index games_one_active_per_kind on public.games (household_id, kind) where status = 'active';
alter table public.games enable row level security;

create policy "members see games" on public.games for select to authenticated
  using (public.is_member(household_id));
create policy "challenge your partner" on public.games for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and public.is_member(household_id)
    and exists (select 1 from public.household_members m where m.household_id = games.household_id and m.user_id = games.opponent)
    and status = 'active' and winner is null and round = 1
  );
-- Turn-based moves: only the player whose turn it is can change the board.
create policy "move on your turn" on public.games for update to authenticated
  using (public.is_member(household_id) and status = 'active' and turn = (select auth.uid()))
  with check (public.is_member(household_id));
revoke update on public.games from anon, authenticated;
grant update (turn, state, status, winner) on public.games to authenticated;

create function public.games_touch()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.last_actor := new.created_by;
    delete from public.games
      where household_id = new.household_id and status = 'done' and updated_at < now() - interval '180 days';
  else
    new.last_actor := coalesce((select auth.uid()), new.last_actor);
  end if;
  if new.turn is not null and new.turn not in (new.created_by, new.opponent) then
    raise exception 'Not a player in this game';
  end if;
  if new.winner is not null and new.winner not in (new.created_by, new.opponent) then
    raise exception 'Not a player in this game';
  end if;
  return new;
end;
$$;
revoke execute on function public.games_touch() from public, anon, authenticated;
create trigger games_touch before insert or update on public.games
  for each row execute function public.games_touch();

-- Either player can end a game early; the other one gets the win.
create function public.end_game(p_game uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  g  public.games;
  me uuid := (select auth.uid());
begin
  select * into g from public.games where id = p_game for update;
  if g.id is null or me is null or me not in (g.created_by, g.opponent) then
    raise exception 'Not your game';
  end if;
  if g.status <> 'active' then
    return;
  end if;
  update public.games
    set status = 'done',
        turn = null,
        winner = case when g.kind = 'thisorthat' then null
                      when me = g.created_by then g.opponent else g.created_by end,
        state = g.state || jsonb_build_object('ended_by', me)
    where id = p_game;
end;
$$;
revoke execute on function public.end_game(uuid) from public, anon;
grant execute on function public.end_game(uuid) to authenticated;

-- ---------- hidden picks (Rock Paper Scissors, This or That) ----------
-- Each pick is visible only to the person who made it until both have picked;
-- then the database writes both into the game for everyone to see.
create table public.game_picks (
  id           uuid primary key default gen_random_uuid(),
  game_id      uuid not null references public.games on delete cascade,
  household_id uuid not null references public.households on delete cascade,
  user_id      uuid not null default auth.uid() references auth.users on delete cascade,
  round        integer not null,
  pick         text not null check (char_length(pick) <= 12),
  created_at   timestamptz not null default now(),
  unique (game_id, user_id, round)
);
create index game_picks_game_idx on public.game_picks (game_id, round);
alter table public.game_picks enable row level security;
create policy "see own picks" on public.game_picks for select to authenticated
  using (user_id = (select auth.uid()));
create policy "pick in your games" on public.game_picks for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_member(household_id));

create function public.play_pick()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  g       public.games;
  other   uuid;
  theirs  text;
  st      jsonb;
  target  integer;
  mine_n  integer;
  their_n integer;
  outcome integer;
  matches integer;
  total   integer;
  done    boolean := false;
  win     uuid := null;
begin
  -- Lock the game so two picks arriving together are handled one after the other.
  select * into g from public.games where id = new.game_id for update;
  if g.id is null or g.household_id <> new.household_id then raise exception 'No such game'; end if;
  if g.status <> 'active' then raise exception 'This game is over'; end if;
  if g.kind not in ('rps', 'thisorthat') then raise exception 'Not a pick game'; end if;
  if new.user_id not in (g.created_by, g.opponent) then raise exception 'Not your game'; end if;
  if new.round <> g.round then raise exception 'That round is over'; end if;
  if (g.kind = 'rps' and new.pick not in ('rock', 'paper', 'scissors'))
     or (g.kind = 'thisorthat' and new.pick not in ('a', 'b')) then
    raise exception 'Not a valid pick';
  end if;

  other := case when new.user_id = g.created_by then g.opponent else g.created_by end;
  select p.pick into theirs from public.game_picks p
    where p.game_id = g.id and p.user_id = other and p.round = g.round;

  if theirs is null then
    -- First to pick this round: just say so, without saying what.
    update public.games set state = g.state || jsonb_build_object('picked', jsonb_build_array(new.user_id))
      where id = g.id;
    return new;
  end if;

  -- Both have picked: reveal the round.
  st := g.state || jsonb_build_object(
    'picked', '[]'::jsonb,
    'rounds', coalesce(g.state->'rounds', '[]'::jsonb)
              || jsonb_build_array(jsonb_build_object(new.user_id::text, new.pick, other::text, theirs)));

  if g.kind = 'rps' then
    outcome := case
      when new.pick = theirs then 0
      when (new.pick = 'rock' and theirs = 'scissors') or (new.pick = 'scissors' and theirs = 'paper')
        or (new.pick = 'paper' and theirs = 'rock') then 1
      else -1 end;
    mine_n := coalesce((g.state->'score'->>new.user_id::text)::integer, 0) + (outcome = 1)::integer;
    their_n := coalesce((g.state->'score'->>other::text)::integer, 0) + (outcome = -1)::integer;
    st := st || jsonb_build_object('score', jsonb_build_object(new.user_id::text, mine_n, other::text, their_n));
    target := coalesce((g.state->>'target')::integer, 3);
    if mine_n >= target then done := true; win := new.user_id;
    elsif their_n >= target then done := true; win := other;
    end if;
  else
    matches := coalesce((g.state->>'matches')::integer, 0) + (new.pick = theirs)::integer;
    st := st || jsonb_build_object('matches', matches);
    total := coalesce(jsonb_array_length(g.state->'questions'), 10);
    done := g.round >= total;
  end if;

  update public.games
    set state = st,
        round = case when done then g.round else g.round + 1 end,
        status = case when done then 'done' else 'active' end,
        winner = win
    where id = g.id;
  return new;
end;
$$;
revoke execute on function public.play_pick() from public, anon, authenticated;
create trigger game_picks_play before insert on public.game_picks
  for each row execute function public.play_pick();

-- ---------- notifications: challenges, your move, results ----------
create function public.notify_game()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_url    text;
  v_secret text;
  actor    uuid;
  target   uuid;
  ev       text;
begin
  if tg_op = 'INSERT' then
    actor := new.created_by;
    target := new.opponent;
    ev := 'challenge';
  else
    actor := new.last_actor;
    if actor is null then return new; end if;
    target := case when actor = new.created_by then new.opponent else new.created_by end;
    if new.status = 'done' and old.status <> 'done' then ev := 'finished';
    elsif new.status <> 'active' then return new;
    elsif new.round > old.round then ev := 'round';
    elsif new.turn is distinct from old.turn and new.turn = target then ev := 'turn';
    elsif new.state->'picked' is distinct from old.state->'picked'
      and jsonb_array_length(coalesce(new.state->'picked', '[]'::jsonb)) > 0 then ev := 'picked';
    else return new;
    end if;
  end if;

  -- Already looking at this game: the board updates live, no need to buzz.
  if exists (select 1 from public.household_members m
             where m.household_id = new.household_id and m.user_id = target
               and m.watching_game = new.id and m.watching_at > now() - interval '45 seconds') then
    return new;
  end if;

  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'notify_function_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_webhook_secret';
  if v_url is null or v_secret is null then return new; end if;
  perform net.http_post(
    url := v_url,
    body := jsonb_build_object('table', 'game_event', 'record', jsonb_build_object(
      'id', new.id, 'household_id', new.household_id, 'kind', new.kind, 'event', ev,
      'from_user', actor, 'to_user', target, 'winner', new.winner, 'round', new.round,
      'matches', new.state->'matches', 'total', jsonb_array_length(coalesce(new.state->'questions', '[]'::jsonb)),
      'ended_by', new.state->'ended_by')),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', v_secret),
    timeout_milliseconds := 5000
  );
  return new;
end;
$$;
revoke execute on function public.notify_game() from public, anon, authenticated;
create trigger games_notify after insert or update on public.games
  for each row execute function public.notify_game();

alter publication supabase_realtime add table public.games, public.game_picks;
