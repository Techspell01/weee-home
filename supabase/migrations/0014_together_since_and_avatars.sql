-- "Days together" and profile photos.

-- The day the couple got together (for the "1,096 days together" counter).
alter table public.households add column together_since date;

-- Each person's profile photo (path inside the private "avatars" bucket).
alter table public.household_members add column avatar_path text check (char_length(avatar_path) <= 200);

-- Private bucket: small images only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Does the signed-in user share a household with the user whose folder this is?
create function public.can_see_avatar_folder(p_folder text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select p_folder = (select auth.uid())::text
      or exists (
        select 1
        from public.household_members mine
        join public.household_members theirs on theirs.household_id = mine.household_id
        where mine.user_id = (select auth.uid()) and theirs.user_id::text = p_folder
      );
$$;
revoke execute on function public.can_see_avatar_folder(text) from public, anon;
grant execute on function public.can_see_avatar_folder(text) to authenticated;

-- Photos live at avatars/<user id>/<file>. You manage only your own folder;
-- you can see the photos of people you share a household with.
create policy "avatars: see household photos" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and public.can_see_avatar_folder((storage.foldername(name))[1]));
create policy "avatars: upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "avatars: replace own" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "avatars: remove own" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
