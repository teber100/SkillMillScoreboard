-- Arcade Tournament Schema (Supabase / Postgres)
-- Safe to run once on a new project

-- Optional: keep everything in public schema (default)
-- create schema if not exists public;

-- 1) Players
create table if not exists public.players (
  id bigint generated always as identity primary key,
  name text not null,
  created_at timestamptz not null default now(),

  constraint players_name_not_blank check (length(trim(name)) > 0),
  constraint players_name_unique unique (name)
);

-- 2) Games
create table if not exists public.games (
  id bigint generated always as identity primary key,
  name text not null,
  scoring_direction text not null default 'higher',
  min_score numeric null,
  max_score numeric null,
  logo_url text null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint games_name_not_blank check (length(trim(name)) > 0),
  constraint games_name_unique unique (name),
  constraint games_scoring_direction_valid check (scoring_direction in ('higher', 'lower')),
  constraint games_score_range_valid check (
    min_score is null
    or max_score is null
    or min_score <= max_score
  )
);

-- 3) Scores (raw submissions)
create table if not exists public.scores (
  id bigint generated always as identity primary key,
  player_id bigint not null references public.players(id) on delete cascade,
  game_id bigint not null references public.games(id) on delete cascade,
  score_value numeric not null,
  submitted_by_admin boolean not null default false,
  created_at timestamptz not null default now()

  -- Note: we intentionally do NOT add a uniqueness constraint on (player_id, game_id)
  -- because your app allows multiple submissions and only the best score counts.
);

-- Helpful indexes for leaderboard / top-3 / "best score per player per game" queries
create index if not exists idx_scores_game_id on public.scores (game_id);
create index if not exists idx_scores_player_id on public.scores (player_id);
create index if not exists idx_scores_game_player_created on public.scores (game_id, player_id, created_at desc);
create index if not exists idx_scores_player_game_created on public.scores (player_id, game_id, created_at desc);

create index if not exists idx_games_sort_order on public.games (sort_order);
create index if not exists idx_games_is_active_sort on public.games (is_active, sort_order);

-- Optional index that can help raw score sorting
create index if not exists idx_scores_game_score on public.scores (game_id, score_value);

-- 4) Auto-update updated_at on games
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_games_set_updated_at on public.games;

create trigger trg_games_set_updated_at
before update on public.games
for each row
execute function public.set_updated_at();

-- 5) (Optional but recommended) Seed your 15 games
-- Adjust ranges/logo URLs later from your Admin page.
insert into public.games (name, scoring_direction, min_score, max_score, sort_order)
values
  ('Joust', 'higher', 0, 2000000, 1),
  ('Rastan', 'higher', 0, 2000000, 2),
  ('Badlands', 'higher', 0, 200000, 3),
  ('US Championship Vball', 'higher', 0, 30, 4),
  ('Aliens', 'higher', 0, 2000000, 5),
  ('Dynamite Duke', 'higher', 0, 2000000, 6),
  ('Lethal Enforcers', 'higher', 0, 2000000, 7),
  ('Capcom Bowling', 'higher', 0, 300, 8),
  ('Rush n'' Attack', 'higher', 0, 500000, 9),
  ('Galaga', 'higher', 0, 5000000, 10),
  ('Operation: Wolf', 'higher', 0, 2000000, 11),
  ('Centipede', 'higher', 0, 1000000, 12),
  ('Dig Dug', 'higher', 0, 500000, 13),
  ('Arkanoid', 'higher', 0, 1000000, 14),
  ('Golden Tee 97''', 'lower', -20, 40, 15)
  ('NBA Hangtime', 'higher', 0, 40, 16),
  ('NFL Blitz', 'higher', 0, 40, 17)
on conflict (name) do nothing;

-- 6) (Optional) Create a simple view for "best score per player per game"
-- This can make app queries easier, but your app can also compute this itself.
create or replace view public.best_scores as
select
  s.game_id,
  s.player_id,
  g.scoring_direction,
  case
    when g.scoring_direction = 'higher' then max(s.score_value)
    else min(s.score_value)
  end as best_score,
  max(s.created_at) as last_submission_at
from public.scores s
join public.games g on g.id = s.game_id
group by s.game_id, s.player_id, g.scoring_direction;
