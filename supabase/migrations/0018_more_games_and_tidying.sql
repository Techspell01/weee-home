-- Four more games, hiding built-in love notes, and clearing games from your Recent list.

-- ---------- more games ----------
alter table public.games drop constraint games_kind_check;
alter table public.games add constraint games_kind_check check (kind in (
  'tictactoe', 'connect4', 'rps', 'thisorthat',      -- the first four
  'mostlikely', 'knowme', 'truthordare', 'memory'    -- new: Who's More Likely To, How Well Do You Know Me, Truth or Dare, Memory Match
));

-- Hidden-pick games: Rock Paper Scissors plus three "a or b" question games
-- (This or That, Who's More Likely To, How Well Do You Know Me).
create or replace function public.play_pick()
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
  if g.kind not in ('rps', 'thisorthat', 'mostlikely', 'knowme') then raise exception 'Not a pick game'; end if;
  if new.user_id not in (g.created_by, g.opponent) then raise exception 'Not your game'; end if;
  if new.round <> g.round then raise exception 'That round is over'; end if;
  if (g.kind = 'rps' and new.pick not in ('rock', 'paper', 'scissors'))
     or (g.kind <> 'rps' and new.pick not in ('a', 'b')) then
    raise exception 'Not a valid pick';
  end if;

  other := case when new.user_id = g.created_by then g.opponent else g.created_by end;
  select p.pick into theirs from public.game_picks p
    where p.game_id = g.id and p.user_id = other and p.round = g.round;

  if theirs is null then
    update public.games set state = g.state || jsonb_build_object('picked', jsonb_build_array(new.user_id))
      where id = g.id;
    return new;
  end if;

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

-- Ending a just-for-fun game early has no winner.
create or replace function public.end_game(p_game uuid)
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
        winner = case when g.kind in ('thisorthat', 'mostlikely', 'knowme', 'truthordare') then null
                      when me = g.created_by then g.opponent else g.created_by end,
        state = g.state || jsonb_build_object('ended_by', me)
    where id = p_game;
end;
$$;

-- Housekeeping on every change; hiding a finished game isn't a move, so it keeps its time and mover.
create or replace function public.games_touch()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.state = old.state and new.status = old.status and new.round = old.round
     and new.turn is not distinct from old.turn and new.winner is not distinct from old.winner then
    new.updated_at := old.updated_at;
    new.last_actor := old.last_actor;
    return new;
  end if;
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

-- ---------- clearing finished games from your own Recent list ----------
-- Only hides them for you: your partner's list and the scoreboard stay as they are.
alter table public.games add column hidden_by uuid[] not null default '{}';

create function public.hide_games(p_games uuid[])
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  n  integer;
begin
  if me is null then raise exception 'Not signed in'; end if;
  update public.games
    set hidden_by = array_append(hidden_by, me)
    where id = any(p_games) and status = 'done' and me in (created_by, opponent) and not (me = any(hidden_by));
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function public.hide_games(uuid[]) from public, anon;
grant execute on function public.hide_games(uuid[]) to authenticated;

-- ---------- hiding the built-in love notes you don't use ----------
alter table public.household_members
  add column hidden_notes text[] not null default '{}'
  check (hidden_notes <@ array['heart', 'love', 'miss', 'where']::text[]);
