-- "Thinking of you" grows into a few love notes: heart, I love you, I miss you, where are you?
alter table public.nudges add column kind text not null default 'heart'
  check (kind in ('heart', 'love', 'miss', 'where'));
