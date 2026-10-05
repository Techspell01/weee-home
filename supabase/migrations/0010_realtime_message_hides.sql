-- message_hides was missing from the realtime publication. Subscribing to a table
-- that isn't published makes Supabase reject the whole channel's postgres_changes,
-- which stopped every live update in the app (chat, list, map) until a reload.
alter publication supabase_realtime add table public.message_hides;
