-- Migration: add tournament support with safe backfill
-- Run once on an existing project that already has players/games/scores.

begin;

create table if not exists public.tournaments (
  id bigint generated always as identity primary key,
  name text not null unique,
  start_date date null,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  constraint tournaments_name_not_blank check (length(trim(name)) > 0),
  constraint tournaments_status_valid check (status in ('active', 'archived', 'draft'))
);

insert into public.tournaments (name, status)
values ('Skill Mill 2026', 'active')
on conflict (name) do nothing;

alter table public.games
  add column if not exists tournament_id bigint;

alter table public.scores
  add column if not exists tournament_id bigint;

-- Backfill all existing rows into default tournament
update public.games g
set tournament_id = t.id
from public.tournaments t
where g.tournament_id is null
  and t.name = 'Skill Mill 2026';

update public.scores s
set tournament_id = t.id
from public.tournaments t
where s.tournament_id is null
  and t.name = 'Skill Mill 2026';

-- Add FKs after backfill
alter table public.games
  drop constraint if exists games_tournament_id_fkey,
  add constraint games_tournament_id_fkey
    foreign key (tournament_id) references public.tournaments(id) on delete cascade;

alter table public.scores
  drop constraint if exists scores_tournament_id_fkey,
  add constraint scores_tournament_id_fkey
    foreign key (tournament_id) references public.tournaments(id) on delete cascade;

alter table public.games
  alter column tournament_id set not null;

alter table public.scores
  alter column tournament_id set not null;

-- Replace old global game uniqueness with per-tournament uniqueness
alter table public.games drop constraint if exists games_name_unique;
alter table public.games add constraint games_name_per_tournament_unique unique (tournament_id, name);

-- Helpful indexes
create index if not exists idx_tournaments_status on public.tournaments (status);
create index if not exists idx_games_tournament_active_sort on public.games (tournament_id, is_active, sort_order);
create index if not exists idx_games_tournament_name on public.games (tournament_id, name);
create index if not exists idx_scores_tournament_game_player_created on public.scores (tournament_id, game_id, player_id, created_at desc);
create index if not exists idx_scores_tournament_player_game_created on public.scores (tournament_id, player_id, game_id, created_at desc);
create index if not exists idx_scores_tournament_game_score on public.scores (tournament_id, game_id, score_value);

-- Enforce exactly one active tournament choice
create unique index if not exists idx_tournaments_single_active
  on public.tournaments ((status))
  where status = 'active';

-- If status drifted, normalize to one active tournament
update public.tournaments set status = 'archived' where status = 'active' and name <> 'Skill Mill 2026';
update public.tournaments set status = 'active' where name = 'Skill Mill 2026';

commit;
