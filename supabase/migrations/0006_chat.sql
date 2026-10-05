-- Chat: a private conversation for the household, with read receipts and push
-- notifications for new messages (through the same notify trigger/function).

create table public.messages (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households on delete cascade,
  user_id      uuid default auth.uid() references auth.users on delete set null,
  body         text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at   timestamptz not null default now()
);
create index messages_household_created_idx on public.messages (household_id, created_at desc);

alter table public.messages enable row level security;
create policy "members read chat" on public.messages for select to authenticated
  using (public.is_member(household_id));
create policy "members send as themselves" on public.messages for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_member(household_id));
create policy "unsend own messages" on public.messages for delete to authenticated
  using (user_id = (select auth.uid()));

-- When each person last read the chat (unread counts and "Seen").
alter table public.household_members add column chat_read_at timestamptz;

create trigger messages_notify after insert on public.messages
  for each row execute function public.notify_household_change();

alter publication supabase_realtime add table public.messages;
