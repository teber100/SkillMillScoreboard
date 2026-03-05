-- Arcade Tournament Schema (Supabase / Postgres)
-- Safe to run once on a new project

-- 1) Players (global across tournaments)
create table if not exists public.players (
  id bigint generated always as identity primary key,
  name text not null,
  created_at timestamptz not null default now(),

  constraint players_name_not_blank check (length(trim(name)) > 0),
  constraint players_name_unique unique (name)
);

-- 2) Tournaments (one active at a time)
create table if not exists public.tournaments (
  id bigint generated always as identity primary key,
  name text not null unique,
  start_date date null,
  status text not null default 'draft',
  created_at timestamptz not null default now(),

  constraint tournaments_name_not_blank check (length(trim(name)) > 0),
  constraint tournaments_status_valid check (status in ('active', 'archived', 'draft'))
);

-- 3) Games (scoped to tournament)
create table if not exists public.games (
  id bigint generated always as identity primary key,
  tournament_id bigint not null references public.tournaments(id) on delete cascade,
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
  constraint games_name_per_tournament_unique unique (tournament_id, name),
  constraint games_scoring_direction_valid check (scoring_direction in ('higher', 'lower')),
  constraint games_score_range_valid check (
    min_score is null
    or max_score is null
    or min_score <= max_score
  )
);

-- 4) Scores (raw submissions, scoped to tournament)
create table if not exists public.scores (
  id bigint generated always as identity primary key,
  tournament_id bigint not null references public.tournaments(id) on delete cascade,
  player_id bigint not null references public.players(id) on delete cascade,
  game_id bigint not null references public.games(id) on delete cascade,
  score_value numeric not null,
  submitted_by_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- 5) Official tournament podium results (legacy winners)
create table if not exists public.tournament_results (
  id bigint generated always as identity primary key,
  tournament_id bigint not null references public.tournaments(id) on delete cascade,
  place integer not null,
  player_id bigint not null references public.players(id) on delete cascade,
  notes text null,
  created_at timestamptz not null default now(),

  constraint tournament_results_place_valid check (place in (1, 2, 3)),
  constraint tournament_results_unique_place_per_tournament unique (tournament_id, place)
);

-- Helpful indexes
create index if not exists idx_tournaments_status on public.tournaments (status);
create index if not exists idx_games_tournament_active_sort on public.games (tournament_id, is_active, sort_order);
create index if not exists idx_games_tournament_name on public.games (tournament_id, name);
create index if not exists idx_scores_tournament_game_player_created on public.scores (tournament_id, game_id, player_id, created_at desc);
create index if not exists idx_scores_tournament_player_game_created on public.scores (tournament_id, player_id, game_id, created_at desc);
create index if not exists idx_scores_tournament_game_score on public.scores (tournament_id, game_id, score_value);
create index if not exists idx_tournament_results_tournament_id on public.tournament_results (tournament_id);

-- Ensure only one active tournament (partial unique index)
create unique index if not exists idx_tournaments_single_active
  on public.tournaments ((status))
  where status = 'active';

-- 6) Auto-update updated_at on games
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

-- 7) Seed a default active tournament and games
insert into public.tournaments (name, status)
values ('Skill Mill 2026', 'active')
on conflict (name) do nothing;

insert into public.games (tournament_id, name, scoring_direction, min_score, max_score, sort_order)
select t.id, seed.name, seed.scoring_direction, seed.min_score, seed.max_score, seed.sort_order
from public.tournaments t
cross join (
  values
    ('Joust', 'higher', 0::numeric, 2000000::numeric, 1),
    ('Rastan', 'higher', 0::numeric, 2000000::numeric, 2),
    ('Badlands', 'higher', 0::numeric, 200000::numeric, 3),
    ('US Championship Vball', 'higher', 0::numeric, 30::numeric, 4),
    ('Aliens', 'higher', 0::numeric, 2000000::numeric, 5),
    ('Dynamite Duke', 'higher', 0::numeric, 2000000::numeric, 6),
    ('Lethal Enforcers', 'higher', 0::numeric, 2000000::numeric, 7),
    ('Capcom Bowling', 'higher', 0::numeric, 300::numeric, 8),
    ('Rush n'' Attack', 'higher', 0::numeric, 500000::numeric, 9),
    ('Galaga', 'higher', 0::numeric, 5000000::numeric, 10),
    ('Operation: Wolf', 'higher', 0::numeric, 2000000::numeric, 11),
    ('Centipede', 'higher', 0::numeric, 1000000::numeric, 12),
    ('Dig Dug', 'higher', 0::numeric, 500000::numeric, 13),
    ('Arkanoid', 'higher', 0::numeric, 1000000::numeric, 14),
    ('Golden Tee 97''', 'lower', -20::numeric, 40::numeric, 15),
    ('NBA Hangtime', 'higher', 0::numeric, 40::numeric, 16),
    ('NFL Blitz', 'higher', 0::numeric, 40::numeric, 17)
) as seed(name, scoring_direction, min_score, max_score, sort_order)
where t.name = 'Skill Mill 2026'
on conflict (tournament_id, name) do nothing;

-- 8) Optional view for best score per player per game within each tournament
create or replace view public.best_scores as
select
  s.tournament_id,
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
group by s.tournament_id, s.game_id, s.player_id, g.scoring_direction;
