-- Migration: official tournament full standings (legacy display-only)
-- Safe to run once on existing projects.
-- This migration only creates a new table and indexes.

create table if not exists public.tournament_standings (
  id bigint generated always as identity primary key,
  tournament_id bigint not null references public.tournaments(id) on delete cascade,
  player_id bigint not null references public.players(id) on delete cascade,
  rank integer not null,
  total_points numeric null,
  notes text null,
  created_at timestamptz not null default now(),

  constraint tournament_standings_rank_positive check (rank > 0),
  constraint tournament_standings_unique_player_per_tournament unique (tournament_id, player_id),
  constraint tournament_standings_unique_rank_per_tournament unique (tournament_id, rank)
);

create index if not exists idx_tournament_standings_tournament_rank
  on public.tournament_standings (tournament_id, rank);
