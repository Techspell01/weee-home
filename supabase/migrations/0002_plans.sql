-- Plans: dates, outings, to-dos and trips for the coming week or month.
-- plan_date null = "someday" idea with no date yet.
create table public.plans (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households on delete cascade,
  title        text not null check (char_length(title) between 1 and 100),
  kind         text not null default 'todo' check (kind in ('date', 'outing', 'todo', 'trip', 'family')),
  plan_date    date,
  plan_time    time,
  place        text not null default '' check (char_length(place) <= 120),
  notes        text not null default '' check (char_length(notes) <= 500),
  done         boolean not null default false,
  done_at      timestamptz,
  created_by   uuid default auth.uid() references auth.users on delete set null,
  created_at   timestamptz not null default now()
);
create index plans_household_idx on public.plans (household_id);

alter table public.plans enable row level security;
create policy "household plans" on public.plans for all to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));

alter publication supabase_realtime add table public.plans;
