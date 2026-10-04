-- Push notifications: each phone that turns notifications on stores its push
-- subscription here. When someone adds a list item or a plan, a trigger calls the
-- `notify` Edge Function, which pushes to everyone else in the household.

create table public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users on delete cascade,
  household_id uuid not null references public.households on delete cascade,
  endpoint     text not null unique,
  p256dh       text not null,
  auth         text not null,
  created_at   timestamptz not null default now()
);
create index push_subscriptions_household_idx on public.push_subscriptions (household_id);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
create policy "own subscriptions read" on public.push_subscriptions for select to authenticated
  using (user_id = (select auth.uid()));
create policy "own subscriptions add" on public.push_subscriptions for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_member(household_id));
create policy "own subscriptions change" on public.push_subscriptions for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and public.is_member(household_id));
create policy "own subscriptions remove" on public.push_subscriptions for delete to authenticated
  using (user_id = (select auth.uid()));

-- Calls the Edge Function. Its URL and shared secret live in Supabase Vault
-- (names: notify_function_url, push_webhook_secret), not in this file.
create extension if not exists pg_net with schema extensions;

create function public.notify_household_change()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_url    text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'notify_function_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_webhook_secret';
  if v_url is null or v_secret is null then
    return new;
  end if;
  perform net.http_post(
    url := v_url,
    body := jsonb_build_object('table', tg_table_name, 'record', to_jsonb(new)),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', v_secret),
    timeout_milliseconds := 5000
  );
  return new;
end;
$$;
revoke execute on function public.notify_household_change() from public, anon, authenticated;

create trigger items_notify after insert on public.items
  for each row execute function public.notify_household_change();
create trigger plans_notify after insert on public.plans
  for each row execute function public.notify_household_change();
