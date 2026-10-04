-- Spending categories, personal schedules in Plans, and account deletion.

-- ---------- expenses: category for the spending summary ----------
alter table public.expenses
  add column category text not null default 'other'
  check (category in ('groceries', 'outing', 'rent', 'bills', 'travel', 'shopping', 'health', 'other'));

-- Keep the household's spending history if the payer deletes their account.
alter table public.expenses alter column paid_by drop not null;
alter table public.expenses drop constraint expenses_paid_by_fkey;
alter table public.expenses add constraint expenses_paid_by_fkey
  foreign key (paid_by) references auth.users on delete set null;

-- ---------- plans: personal schedule items ----------
-- owner null = a plan for everyone; owner set = that person's own schedule,
-- still visible to the whole household so partners can see each other's day.
alter table public.plans add column owner uuid references auth.users on delete cascade;
alter table public.plans add column end_time time;
alter table public.plans drop constraint plans_kind_check;
alter table public.plans add constraint plans_kind_check
  check (kind in ('date', 'outing', 'todo', 'trip', 'family', 'work'));

-- ---------- delete my account ----------
-- Removes the signed-in user. Households where they were the only member are
-- deleted with them; shared households keep their lists for everyone else.
create function public.delete_my_account()
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'Sign in first'; end if;

  delete from public.households h
  where exists (select 1 from public.household_members m where m.household_id = h.id and m.user_id = v_uid)
    and not exists (select 1 from public.household_members m where m.household_id = h.id and m.user_id <> v_uid);

  delete from auth.users where id = v_uid;
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
