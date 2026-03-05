-- Migration: official tournament podium results
-- Safe to run once on existing projects
-- This migration does not modify existing tournaments, games, or scores data.

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

create index if not exists idx_tournament_results_tournament_id on public.tournament_results (tournament_id);
