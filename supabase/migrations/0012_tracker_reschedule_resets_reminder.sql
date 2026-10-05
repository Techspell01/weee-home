-- Changing a tracker's reminder time always re-arms its reminder.
create function public.rearm_tracker_reminder()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.next_at is distinct from old.next_at then
    new.notified_at := null;
  end if;
  return new;
end;
$$;

create trigger trackers_rearm before update of next_at on public.trackers
  for each row execute function public.rearm_tracker_reminder();
