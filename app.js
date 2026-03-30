const DEFAULT_ADMIN_CODE = "2468";
const LOCAL_STORAGE_KEY = "skillmill_tournament_v1";
const LOCAL_PREFS_KEY = "skillmill_tournament_prefs_v1";
const SUPABASE_SCRIPT_SRC = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";

const defaultGames = [
  { name: "Pac-Man", direction: "higher", min: 0, max: 300000, logoUrl: "" },
  { name: "Galaga", direction: "higher", min: 0, max: 999999, logoUrl: "" },
  { name: "Donkey Kong", direction: "higher", min: 0, max: 250000, logoUrl: "" },
  { name: "Street Fighter II", direction: "higher", min: 0, max: 99, logoUrl: "" },
  { name: "NBA Jam", direction: "higher", min: 0, max: 200, logoUrl: "" },
  { name: "Mortal Kombat", direction: "higher", min: 0, max: 99, logoUrl: "" },
  { name: "Pinball", direction: "higher", min: 0, max: 5000000, logoUrl: "" },
  { name: "Skee-Ball", direction: "higher", min: 0, max: 100000, logoUrl: "" },
  { name: "Air Hockey", direction: "higher", min: 0, max: 21, logoUrl: "" },
  { name: "Mario Kart", direction: "higher", min: 0, max: 15, logoUrl: "" },
  { name: "Daytona USA", direction: "higher", min: 0, max: 9999, logoUrl: "" },
  { name: "Time Crisis", direction: "higher", min: 0, max: 999999, logoUrl: "" },
  { name: "Dance Dance Revolution", direction: "higher", min: 0, max: 1000000, logoUrl: "" },
  { name: "Whac-A-Mole", direction: "higher", min: 0, max: 1000, logoUrl: "" },
  { name: "Big Buck Hunter", direction: "higher", min: 0, max: 99999, logoUrl: "" },
  { name: "Golden Tee", direction: "lower", min: -30, max: 30, logoUrl: "" },
  { name: "Tetris", direction: "higher", min: 0, max: 999999, logoUrl: "" },
];

const defaultState = {
  tournaments: [{ id: "local-tournament-1", name: "Default Tournament", status: "active", startDate: null }],
  currentTournamentId: "local-tournament-1",
  players: ["Alex", "Jamie", "Riley"].map((name, idx) => ({ id: `local-player-${idx + 1}`, name })),
  games: defaultGames.map((game, idx) => ({
    id: `local-game-${idx + 1}`,
    tournamentId: "local-tournament-1",
    ...game,
    sortOrder: idx + 1,
    isActive: true,
  })),
  submissions: [],
  officialPodiums: {},
  officialStandings: {},
  adminCode: DEFAULT_ADMIN_CODE,
  overallRevealed: false,
};

const connectionStatus = {
  mode: "loading",
  available: false,
  message: "Connecting to tournament database...",
};

let localStateCache = null;
let supabaseClient = null;
let initPromise = null;
let hallAllTournamentsStatePromise = null;
let hallAllTournamentsStateCache = null;

const HALL_SCORES_PAGE_SIZE = 1000;

function clearHallAllTournamentsCache() {
  hallAllTournamentsStatePromise = null;
  hallAllTournamentsStateCache = null;
}

function normalizeName(name) {
  return String(name || "").trim();
}

const gameNameCollator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getLogoUrl(game) {
  const candidate = typeof game?.logoUrl === "string" ? game.logoUrl.trim() : "";
  return candidate || "";
}

function getGameInitials(name) {
  return (
    normalizeName(name)
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((chunk) => chunk[0]?.toUpperCase() || "")
      .join("") || "🎮"
  );
}

function normalizeGame(game) {
  const source = game || {};
  return {
    id: source.id,
    tournamentId: source.tournamentId,
    name: normalizeName(source.name),
    direction: source.direction === "lower" ? "lower" : "higher",
    min: Number.isFinite(Number(source.min)) ? Number(source.min) : 0,
    max: Number.isFinite(Number(source.max)) ? Number(source.max) : 0,
    logoUrl: getLogoUrl(source),
    sortOrder: Number.isFinite(Number(source.sortOrder)) ? Number(source.sortOrder) : 0,
    isActive: source.isActive !== false,
  };
}

function readLocalPrefs() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LOCAL_PREFS_KEY) || "{}");
    return {
      adminCode: parsed.adminCode || DEFAULT_ADMIN_CODE,
      overallRevealed: parsed.overallRevealed === true,
    };
  } catch {
    return { adminCode: DEFAULT_ADMIN_CODE, overallRevealed: false };
  }
}

function saveLocalPrefs(prefs) {
  localStorage.setItem(LOCAL_PREFS_KEY, JSON.stringify(prefs));
}

function readLegacyLocalState() {
  const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
  if (!raw) {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(defaultState));
    return structuredClone(defaultState);
  }

  try {
    const parsed = JSON.parse(raw);
    const fallbackTournament = { id: "local-tournament-1", name: "Default Tournament", status: "active", startDate: null };
    const tournaments = Array.isArray(parsed.tournaments) && parsed.tournaments.length
      ? parsed.tournaments.map((t, idx) => ({
          id: t.id || `local-tournament-${idx + 1}`,
          name: normalizeName(t.name),
          status: t.status === "active" ? "active" : "archived",
          startDate: t.startDate || null,
        })).filter((t) => t.name)
      : [fallbackTournament];

    const activeTournament = tournaments.find((t) => t.status === "active") || null;
    const fallbackTournamentId = parsed.currentTournamentId || tournaments[0]?.id || fallbackTournament.id;

    const players = Array.isArray(parsed.players)
      ? parsed.players.map((name, idx) => ({ id: `local-player-${idx + 1}`, name: normalizeName(name) })).filter((p) => p.name)
      : [];

    const games = Array.isArray(parsed.games)
      ? parsed.games
          .map((game, idx) =>
            normalizeGame({
              ...game,
              id: game.id || `local-game-${idx + 1}`,
              tournamentId: game.tournamentId || activeTournament?.id || fallbackTournamentId,
              sortOrder: Number.isFinite(Number(game.sortOrder)) ? Number(game.sortOrder) : idx + 1,
              isActive: game.isActive !== false,
            })
          )
          .filter((game) => game.name)
      : [];

    const submissions = Array.isArray(parsed.submissions)
      ? parsed.submissions
          .map((entry, idx) => {
            const playerName = normalizeName(entry.player || entry.playerName);
            const gameName = normalizeName(entry.game || entry.gameName);
            const player = players.find((p) => normalizeName(p.name) === playerName);
            const game = games.find((g) => normalizeName(g.name) === gameName);
            return {
              id: entry.id || `local-score-${idx + 1}`,
              playerId: entry.playerId || player?.id,
              playerName,
              gameId: entry.gameId || game?.id,
              gameName,
              tournamentId: entry.tournamentId || game?.tournamentId || activeTournament?.id || fallbackTournamentId,
              score: Number(entry.score),
              enteredBy: entry.enteredBy || "player",
              createdAt: entry.createdAt || new Date().toISOString(),
            };
          })
          .filter((entry) => Number.isFinite(entry.score) && entry.playerName && entry.gameName)
      : [];

    return {
      adminCode: parsed.adminCode || DEFAULT_ADMIN_CODE,
      overallRevealed: parsed.overallRevealed === true,
      tournaments,
      currentTournamentId: parsed.currentTournamentId || activeTournament?.id || null,
      players,
      games,
      submissions,
      officialPodiums: parsed.officialPodiums && typeof parsed.officialPodiums === "object" ? parsed.officialPodiums : {},
      officialStandings: parsed.officialStandings && typeof parsed.officialStandings === "object" ? parsed.officialStandings : {},
    };
  } catch {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(defaultState));
    return structuredClone(defaultState);
  }
}

function writeLegacyLocalState(state) {
  const compact = {
    adminCode: state.adminCode,
    overallRevealed: state.overallRevealed,
    tournaments: (state.tournaments || []).map((t) => ({
      id: t.id,
      name: t.name,
      status: t.status,
      startDate: t.startDate || null,
    })),
    currentTournamentId: state.currentTournamentId,
    players: state.players.map((player) => player.name),
    games: state.games.map((game) => ({
      id: game.id,
      tournamentId: game.tournamentId,
      name: game.name,
      direction: game.direction,
      min: game.min,
      max: game.max,
      logoUrl: game.logoUrl,
      sortOrder: game.sortOrder,
      isActive: game.isActive !== false,
    })),
    submissions: state.submissions.map((entry) => ({
      id: entry.id,
      tournamentId: entry.tournamentId,
      player: entry.playerName,
      game: entry.gameName,
      score: entry.score,
      enteredBy: entry.enteredBy,
      createdAt: entry.createdAt,
    })),
    officialPodiums: state.officialPodiums || {},
    officialStandings: state.officialStandings || {},
  };
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(compact));
}

function showConnectionBanner() {
  if (typeof document === "undefined") return;
  const existing = document.getElementById("connectionStatusBanner");
  if (existing) existing.remove();

  if (connectionStatus.mode === "supabase") return;

  const main = document.querySelector("main");
  if (!main) return;

  const banner = document.createElement("section");
  banner.id = "connectionStatusBanner";
  banner.className = `card status-banner ${connectionStatus.mode === "local" ? "warn" : "danger"}`;
  banner.textContent = connectionStatus.message;
  main.insertBefore(banner, main.firstChild);
}

async function loadSupabaseScript() {
  if (window.supabase?.createClient) return;

  await new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${SUPABASE_SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", () => reject(new Error("Failed to load Supabase client.")), {
        once: true,
      });
      return;
    }

    const script = document.createElement("script");
    script.src = SUPABASE_SCRIPT_SRC;
    script.defer = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error("Failed to load Supabase client."));
    document.head.appendChild(script);
  });
}

function setConnection(mode, message) {
  connectionStatus.mode = mode;
  connectionStatus.available = mode === "supabase" || mode === "local";
  connectionStatus.message = message;
  showConnectionBanner();
}

async function fetchRuntimeConfig() {
  const response = await fetch("/api/config", { cache: "no-store" });
  if (!response.ok) throw new Error("Failed to load runtime config.");
  return response.json();
}

async function initializeStore() {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const prefs = readLocalPrefs();
    try {
      const config = await fetchRuntimeConfig();
      const url = config.SUPABASE_URL || config.NEXT_PUBLIC_SUPABASE_URL;
      const anonKey = config.SUPABASE_ANON_KEY || config.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      if (!url || !anonKey) {
        localStateCache = readLegacyLocalState();
        localStateCache.adminCode = prefs.adminCode;
        localStateCache.overallRevealed = prefs.overallRevealed;
        setConnection(
          "local",
          "Running in local mode: tournament database not configured in Vercel yet. Data will stay on this device only."
        );
        return;
      }

      await loadSupabaseScript();
      supabaseClient = window.supabase.createClient(url, anonKey);
      const { error } = await supabaseClient.from("players").select("id", { head: true, count: "exact" });
      if (error) throw error;

      setConnection("supabase", "Connected to shared tournament database.");
    } catch (error) {
      if (connectionStatus.mode !== "local") {
        setConnection(
          "error",
          "Tournament database not reachable. Please contact admin and check Supabase/Vercel settings."
        );
      }
      console.error(error);
    }
  })();

  return initPromise;
}

function getCurrentTournamentFromState(state) {
  const tournaments = state?.tournaments || [];
  if (!tournaments.length) return null;
  return (
    tournaments.find((t) => String(t.id) === String(state.currentTournamentId)) ||
    tournaments.find((t) => t.status === "active") ||
    null
  );
}

function ensureCurrentTournament(state) {
  const tournament = getCurrentTournamentFromState(state);
  if (!tournament) {
    throw new Error(
      "No tournament is configured. In Admin, create a tournament and set it as active before using scoring pages."
    );
  }
  return tournament;
}

async function getCurrentTournament() {
  const state = await loadState();
  return ensureCurrentTournament(state);
}

async function loadState(options = {}) {
  const { includeAllTournaments = false } = options;
  await initializeStore();
  const prefs = readLocalPrefs();

  if (connectionStatus.mode === "local") {
    localStateCache = localStateCache || readLegacyLocalState();
    localStateCache.adminCode = prefs.adminCode;
    localStateCache.overallRevealed = prefs.overallRevealed;
    return structuredClone(localStateCache);
  }

  if (connectionStatus.mode !== "supabase") {
    return {
      tournaments: [],
      currentTournamentId: null,
      players: [],
      games: [],
      submissions: [],
      officialPodiums: {},
      officialStandings: {},
      adminCode: prefs.adminCode,
      overallRevealed: prefs.overallRevealed,
    };
  }

  if (includeAllTournaments) {
    if (hallAllTournamentsStateCache) {
      return structuredClone(hallAllTournamentsStateCache);
    }

    if (!hallAllTournamentsStatePromise) {
      hallAllTournamentsStatePromise = loadSupabaseState({ includeAllTournaments, prefs })
        .then((state) => {
          hallAllTournamentsStateCache = state;
          return state;
        })
        .catch((error) => {
          clearHallAllTournamentsCache();
          throw error;
        })
        .finally(() => {
          hallAllTournamentsStatePromise = null;
        });
    }

    return structuredClone(await hallAllTournamentsStatePromise);
  }

  return loadSupabaseState({ includeAllTournaments, prefs });
}

async function fetchAllScoresForHall() {
  const allScores = [];
  let from = 0;

  while (true) {
    const to = from + HALL_SCORES_PAGE_SIZE - 1;
    const scoresResp = await supabaseClient
      .from("scores")
      .select("id,tournament_id,game_id,score_value,submitted_by_admin,created_at,player:players(id,name)")
      .order("created_at", { ascending: true })
      .range(from, to);

    if (scoresResp.error) throw scoresResp.error;

    const batch = scoresResp.data || [];
    allScores.push(...batch);

    if (batch.length < HALL_SCORES_PAGE_SIZE) break;
    from += HALL_SCORES_PAGE_SIZE;
  }

  return allScores;
}

async function loadSupabaseState({ includeAllTournaments, prefs }) {

  const [playersResp, tournamentsResp, officialResultsResp, officialStandingsResp] = await Promise.all([
    supabaseClient.from("players").select("id,name").order("name", { ascending: true }),
    supabaseClient.from("tournaments").select("id,name,start_date,status,created_at").order("created_at", { ascending: false }),
    supabaseClient
      .from("tournament_results")
      .select("tournament_id,place,notes,player:players(id,name)")
      .order("place", { ascending: true }),
    supabaseClient
      .from("tournament_standings")
      .select("tournament_id,rank,total_points,notes,player:players(id,name)")
      .order("rank", { ascending: true }),
  ]);

  if (playersResp.error || tournamentsResp.error || officialResultsResp.error || officialStandingsResp.error) {
    throw playersResp.error || tournamentsResp.error || officialResultsResp.error || officialStandingsResp.error;
  }

  const tournaments = (tournamentsResp.data || [])
    .map((row) => ({
      id: row.id,
      name: normalizeName(row.name),
      startDate: row.start_date || null,
      status: row.status,
      createdAt: row.created_at,
    }))
    .filter((t) => t.name);

  const activeTournament = tournaments.find((t) => t.status === "active") || null;
  const officialPodiums = {};
  (officialResultsResp.data || []).forEach((row) => {
    const tournamentId = String(row.tournament_id);
    if (!officialPodiums[tournamentId]) {
      officialPodiums[tournamentId] = { notes: row.notes || null, places: {} };
    }
    officialPodiums[tournamentId].places[row.place] = {
      playerId: row.player?.id,
      playerName: normalizeName(row.player?.name),
    };
    if (!officialPodiums[tournamentId].notes && row.notes) {
      officialPodiums[tournamentId].notes = row.notes;
    }
  });

  const officialStandings = {};
  (officialStandingsResp.data || []).forEach((row) => {
    const tournamentId = String(row.tournament_id);
    if (!officialStandings[tournamentId]) officialStandings[tournamentId] = [];
    officialStandings[tournamentId].push({
      playerId: row.player?.id,
      playerName: normalizeName(row.player?.name),
      rank: Number(row.rank),
      totalPoints: row.total_points == null ? null : Number(row.total_points),
      notes: row.notes || null,
    });
  });

  if (!activeTournament && !includeAllTournaments) {
    return {
      tournaments,
      currentTournamentId: null,
      players: (playersResp.data || []).map((row) => ({ id: row.id, name: normalizeName(row.name) })).filter((p) => p.name),
      games: [],
      submissions: [],
      officialPodiums,
      officialStandings,
      adminCode: prefs.adminCode,
      overallRevealed: prefs.overallRevealed,
    };
  }

  const tournamentScopeId = includeAllTournaments ? null : activeTournament?.id;

  const gamesQuery = supabaseClient
    .from("games")
    .select("id,tournament_id,name,scoring_direction,min_score,max_score,logo_url,sort_order,is_active")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (tournamentScopeId) {
    gamesQuery.eq("tournament_id", tournamentScopeId);
  }

  const [gamesResp, scoresData] = await Promise.all([
    gamesQuery,
    includeAllTournaments
      ? fetchAllScoresForHall()
      : supabaseClient
          .from("scores")
          .select("id,tournament_id,game_id,score_value,submitted_by_admin,created_at,player:players(id,name)")
          .order("created_at", { ascending: true })
          .eq("tournament_id", tournamentScopeId),
  ]);

  if (gamesResp.error) {
    throw gamesResp.error;
  }

  const players = (playersResp.data || []).map((row) => ({ id: row.id, name: normalizeName(row.name) })).filter((p) => p.name);
  const games = (gamesResp.data || [])
    .map((row) =>
      normalizeGame({
        id: row.id,
        tournamentId: row.tournament_id,
        name: row.name,
        direction: row.scoring_direction,
        min: row.min_score ?? 0,
        max: row.max_score ?? 0,
        logoUrl: row.logo_url || "",
        sortOrder: row.sort_order,
        isActive: row.is_active,
      })
    )
    .filter((game) => game.name);

  const gameById = new Map(games.map((game) => [String(game.id), game]));

  const rawScores = includeAllTournaments ? scoresData : (scoresData.data || []);
  const submissions = rawScores
    .map((row) => ({
      id: row.id,
      tournamentId: row.tournament_id,
      playerId: row.player?.id,
      playerName: normalizeName(row.player?.name),
      gameId: row.game_id,
      gameName: normalizeName(gameById.get(String(row.game_id))?.name),
      score: Number(row.score_value),
      enteredBy: row.submitted_by_admin ? "admin" : "player",
      createdAt: row.created_at,
    }))
    .filter((entry) => entry.playerName && entry.gameName && Number.isFinite(entry.score));

  return {
    tournaments,
    currentTournamentId: activeTournament?.id || null,
    players,
    games,
    submissions,
    officialPodiums,
    officialStandings,
    adminCode: prefs.adminCode,
    overallRevealed: prefs.overallRevealed,
  };
}

function normalizeOfficialPodiumRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const places = {};
  let notes = null;
  rows.forEach((row) => {
    places[row.place] = {
      playerId: row.player?.id,
      playerName: normalizeName(row.player?.name),
    };
    if (!notes && row.notes) notes = row.notes;
  });
  return { notes, places };
}

function getOfficialStandingsForTournamentFromState(state, tournamentId) {
  const rows = state?.officialStandings?.[String(tournamentId)];
  if (!Array.isArray(rows)) return [];
  return [...rows]
    .filter((row) => Number.isFinite(Number(row?.rank)) && Number(row.rank) > 0)
    .sort((a, b) => Number(a.rank) - Number(b.rank));
}

async function fetchTournamentStandings(tournamentId) {
  if (!tournamentId) throw new Error("Tournament is required.");

  if (connectionStatus.mode === "local") {
    const state = await loadState({ includeAllTournaments: true });
    return getOfficialStandingsForTournamentFromState(state, tournamentId);
  }

  const { data, error } = await supabaseClient
    .from("tournament_standings")
    .select("tournament_id,rank,total_points,notes,player:players(id,name)")
    .eq("tournament_id", tournamentId)
    .order("rank", { ascending: true });

  if (error) throw error;
  return (data || []).map((row) => ({
    playerId: row.player?.id,
    playerName: normalizeName(row.player?.name),
    rank: Number(row.rank),
    totalPoints: row.total_points == null ? null : Number(row.total_points),
    notes: row.notes || null,
  }));
}

async function fetchPlayerStandingForTournament(playerId, tournamentId) {
  if (!playerId || !tournamentId) return null;

  if (connectionStatus.mode === "local") {
    const state = await loadState({ includeAllTournaments: true });
    const match = getOfficialStandingsForTournamentFromState(state, tournamentId)
      .find((row) => String(row.playerId) === String(playerId));
    return match ? { rank: match.rank, totalPoints: match.totalPoints } : null;
  }

  const { data, error } = await supabaseClient
    .from("tournament_standings")
    .select("rank,total_points")
    .eq("tournament_id", tournamentId)
    .eq("player_id", playerId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return {
    rank: Number(data.rank),
    totalPoints: data.total_points == null ? null : Number(data.total_points),
  };
}

async function tournamentHasOfficialStandings(tournamentId) {
  if (!tournamentId) return false;

  if (connectionStatus.mode === "local") {
    const state = await loadState({ includeAllTournaments: true });
    return getOfficialStandingsForTournamentFromState(state, tournamentId).length > 0;
  }

  const { count, error } = await supabaseClient
    .from("tournament_standings")
    .select("id", { head: true, count: "exact" })
    .eq("tournament_id", tournamentId);

  if (error) throw error;
  return Number(count || 0) > 0;
}

async function fetchOfficialPodium(tournamentId) {
  if (!tournamentId) throw new Error("Tournament is required.");

  if (connectionStatus.mode === "local") {
    const state = await loadState();
    return state.officialPodiums?.[String(tournamentId)] || null;
  }

  const { data, error } = await supabaseClient
    .from("tournament_results")
    .select("tournament_id,place,notes,player:players(id,name)")
    .eq("tournament_id", tournamentId)
    .order("place", { ascending: true });

  if (error) throw error;
  return normalizeOfficialPodiumRows(data || []);
}

async function upsertOfficialPodium(tournamentId, podium, notes) {
  if (!tournamentId) throw new Error("Tournament is required.");

  const placements = [1, 2, 3];
  const parsePodiumPlayerId = (rawValue) => {
    if (rawValue == null) return NaN;
    const trimmed = String(rawValue).trim();
    if (!trimmed) return NaN;
    return Number(trimmed);
  };
  const parsedPodium = Object.fromEntries(
    placements.map((place) => [place, parsePodiumPlayerId(podium?.[place])])
  );
  const normalizedNotes = notes ? String(notes).trim() : null;

  if (!Number.isFinite(parsedPodium[1])) {
    throw new Error("Champion (1st place) is required.");
  }

  const filledPlaces = placements.filter((place) => Number.isFinite(parsedPodium[place]));
  const ids = filledPlaces.map((place) => String(parsedPodium[place]));
  if (new Set(ids).size !== ids.length) throw new Error("Each filled podium place must have a different player.");

  const payload = filledPlaces.map((place) => ({
    tournament_id: tournamentId,
    place,
    player_id: parsedPodium[place],
    notes: normalizedNotes,
  }));
  const placesToClear = placements.filter((place) => !filledPlaces.includes(place));

  if (connectionStatus.mode === "local") {
    const state = await loadState();
    const playerById = new Map((state.players || []).map((player) => [String(player.id), player]));
    const localPlaces = {};
    filledPlaces.forEach((place) => {
      const playerId = parsedPodium[place];
      localPlaces[place] = {
        playerId,
        playerName: playerById.get(String(playerId))?.name || "Unknown",
      };
    });

    state.officialPodiums = state.officialPodiums || {};
    state.officialPodiums[String(tournamentId)] = {
      notes: normalizedNotes,
      places: localPlaces,
    };
    await saveState(state);
    return;
  }

  if (payload.length) {
    const { error: upsertError } = await supabaseClient
      .from("tournament_results")
      .upsert(payload, { onConflict: "tournament_id,place" });
    if (upsertError) throw upsertError;
  }

  if (placesToClear.length) {
    const { error: deleteError } = await supabaseClient
      .from("tournament_results")
      .delete()
      .eq("tournament_id", tournamentId)
      .in("place", placesToClear);
    if (deleteError) throw deleteError;
  }

  clearHallAllTournamentsCache();
}

async function clearOfficialPodium(tournamentId) {
  if (!tournamentId) throw new Error("Tournament is required.");

  if (connectionStatus.mode === "local") {
    const state = await loadState();
    state.officialPodiums = state.officialPodiums || {};
    delete state.officialPodiums[String(tournamentId)];
    await saveState(state);
    return;
  }

  const { error } = await supabaseClient.from("tournament_results").delete().eq("tournament_id", tournamentId);
  if (error) throw error;
  clearHallAllTournamentsCache();
}

async function saveState(state) {
  const prefs = {
    adminCode: state.adminCode || DEFAULT_ADMIN_CODE,
    overallRevealed: state.overallRevealed === true,
  };
  saveLocalPrefs(prefs);

  if (connectionStatus.mode === "local") {
    localStateCache = structuredClone(state);
    writeLegacyLocalState(state);
  }
}

async function createTournament({ name, startDate, cloneFromTournamentId }) {
  const normalized = normalizeName(name);
  if (!normalized) throw new Error("Tournament name is required.");

  if (connectionStatus.mode === "local") {
    const state = await loadState();
    if ((state.tournaments || []).some((t) => t.name.toLowerCase() === normalized.toLowerCase())) {
      throw new Error("Tournament name already exists.");
    }

    const newTournament = {
      id: `local-tournament-${crypto.randomUUID()}`,
      name: normalized,
      status: "archived",
      startDate: startDate || null,
    };
    state.tournaments.push(newTournament);

    if (cloneFromTournamentId) {
      const sourceGames = state.games.filter((g) => String(g.tournamentId) === String(cloneFromTournamentId));
      const nextSortBase = 0;
      sourceGames.forEach((g, idx) => {
        state.games.push({
          ...g,
          id: `local-game-${crypto.randomUUID()}`,
          tournamentId: newTournament.id,
          sortOrder: Number.isFinite(Number(g.sortOrder)) ? Number(g.sortOrder) : nextSortBase + idx + 1,
        });
      });
    }

    await saveState(state);
    return newTournament;
  }

  const { data: created, error: createError } = await supabaseClient
    .from("tournaments")
    .insert({
      name: normalized,
      start_date: startDate || null,
      status: "draft",
    })
    .select("id,name,start_date,status")
    .single();
  if (createError) throw createError;
  clearHallAllTournamentsCache();

  if (cloneFromTournamentId) {
    const { data: sourceGames, error: sourceError } = await supabaseClient
      .from("games")
      .select("name,scoring_direction,min_score,max_score,logo_url,sort_order,is_active")
      .eq("tournament_id", cloneFromTournamentId)
      .order("sort_order", { ascending: true });
    if (sourceError) throw sourceError;

    if (sourceGames?.length) {
      const payload = sourceGames.map((game) => ({
        tournament_id: created.id,
        name: game.name,
        scoring_direction: game.scoring_direction,
        min_score: game.min_score,
        max_score: game.max_score,
        logo_url: game.logo_url,
        sort_order: game.sort_order,
        is_active: game.is_active,
      }));
      const { error: cloneError } = await supabaseClient.from("games").insert(payload);
      if (cloneError) throw cloneError;
    }
  }

  return {
    id: created.id,
    name: created.name,
    startDate: created.start_date,
    status: created.status,
  };
}

async function setActiveTournament(tournamentId) {
  if (!tournamentId) throw new Error("Tournament id is required.");

  if (connectionStatus.mode === "local") {
    const state = await loadState();
    const targetExists = (state.tournaments || []).some((t) => String(t.id) === String(tournamentId));
    if (!targetExists) throw new Error("Selected tournament no longer exists. Refresh and try again.");
    state.tournaments = (state.tournaments || []).map((t) => ({
      ...t,
      status: String(t.id) === String(tournamentId) ? "active" : "archived",
    }));
    state.currentTournamentId = tournamentId;
    await saveState(state);
    return;
  }

  const { data: targetTournament, error: targetError } = await supabaseClient
    .from("tournaments")
    .select("id")
    .eq("id", tournamentId)
    .maybeSingle();
  if (targetError) throw targetError;
  if (!targetTournament) throw new Error("Selected tournament no longer exists. Refresh and try again.");

  const { data: previouslyActive, error: previousError } = await supabaseClient
    .from("tournaments")
    .select("id")
    .eq("status", "active");
  if (previousError) throw previousError;

  const { error: archiveError } = await supabaseClient.from("tournaments").update({ status: "archived" }).neq("id", tournamentId);
  if (archiveError) throw archiveError;

  const { error: activeError } = await supabaseClient.from("tournaments").update({ status: "active" }).eq("id", tournamentId);
  if (!activeError) {
    clearHallAllTournamentsCache();
    return;
  }

  const previousActiveId = previouslyActive?.find((t) => String(t.id) !== String(tournamentId))?.id;
  if (previousActiveId) {
    await supabaseClient.from("tournaments").update({ status: "active" }).eq("id", previousActiveId);
  }
  throw activeError;
}

async function addPlayer(name) {
  const normalized = normalizeName(name);
  if (!normalized) throw new Error("Player name is required.");

  if (connectionStatus.mode === "local") {
    const state = await loadState();
    if (state.players.some((player) => player.name.toLowerCase() === normalized.toLowerCase())) {
      throw new Error("Player name already exists.");
    }
    state.players.push({ id: `local-player-${crypto.randomUUID()}`, name: normalized });
    await saveState(state);
    return;
  }

  const { error } = await supabaseClient.from("players").insert({ name: normalized });
  if (error) throw error;
  clearHallAllTournamentsCache();
}

async function updatePlayer(id, name) {
  const normalized = normalizeName(name);
  if (!normalized) throw new Error("Player name is required.");

  if (connectionStatus.mode === "local") {
    const state = await loadState();
    const row = state.players.find((player) => player.id === id);
    if (!row) throw new Error("Player not found.");
    row.name = normalized;
    await saveState(state);
    return;
  }

  const { error } = await supabaseClient.from("players").update({ name: normalized }).eq("id", id);
  if (error) throw error;
  clearHallAllTournamentsCache();
}

async function deletePlayer(id) {
  if (connectionStatus.mode === "local") {
    const state = await loadState();
    state.players = state.players.filter((player) => player.id !== id);
    state.submissions = state.submissions.filter((entry) => entry.playerId !== id);
    await saveState(state);
    return;
  }

  const { error } = await supabaseClient.from("players").delete().eq("id", id);
  if (error) throw error;
  clearHallAllTournamentsCache();
}

async function addGame(gameInput) {
  const game = normalizeGame(gameInput);
  if (!game.name || Number.isNaN(game.min) || Number.isNaN(game.max) || game.min > game.max) {
    throw new Error("Provide valid game name and min/max.");
  }

  const currentTournament = await getCurrentTournament();

  if (connectionStatus.mode === "local") {
    const state = await loadState();
    const duplicate = state.games.some(
      (row) =>
        String(row.tournamentId) === String(currentTournament.id) && row.name.toLowerCase() === game.name.toLowerCase()
    );
    if (duplicate) throw new Error("Game name already exists.");
    state.games.push({ ...game, id: `local-game-${crypto.randomUUID()}`, tournamentId: currentTournament.id });
    await saveState(state);
    return;
  }

  const { data: games, error: maxSortError } = await supabaseClient
    .from("games")
    .select("sort_order")
    .eq("tournament_id", currentTournament.id)
    .order("sort_order", { ascending: false })
    .limit(1);
  if (maxSortError) throw maxSortError;

  const nextSort = Number(games?.[0]?.sort_order || 0) + 1;
  const { error } = await supabaseClient.from("games").insert({
    tournament_id: currentTournament.id,
    name: game.name,
    scoring_direction: game.direction,
    min_score: game.min,
    max_score: game.max,
    logo_url: game.logoUrl || null,
    sort_order: nextSort,
    is_active: true,
  });
  if (error) throw error;
  clearHallAllTournamentsCache();
}

async function updateGame(id, gameInput) {
  const game = normalizeGame(gameInput);
  if (!game.name || Number.isNaN(game.min) || Number.isNaN(game.max) || game.min > game.max) {
    throw new Error("Provide valid game name and min/max.");
  }

  const currentTournament = await getCurrentTournament();

  if (connectionStatus.mode === "local") {
    const state = await loadState();
    const row = state.games.find(
      (entry) => String(entry.id) === String(id) && String(entry.tournamentId) === String(currentTournament.id)
    );
    if (!row) throw new Error("Game not found.");
    Object.assign(row, game);
    await saveState(state);
    return;
  }

  const { error } = await supabaseClient
    .from("games")
    .update({
      name: game.name,
      scoring_direction: game.direction,
      min_score: game.min,
      max_score: game.max,
      logo_url: game.logoUrl || null,
      is_active: game.isActive !== false,
    })
    .eq("id", id)
    .eq("tournament_id", currentTournament.id);
  if (error) throw error;
  clearHallAllTournamentsCache();
}

async function deleteGame(id) {
  const currentTournament = await getCurrentTournament();

  if (connectionStatus.mode === "local") {
    const state = await loadState();
    state.games = state.games.filter(
      (game) => !(String(game.id) === String(id) && String(game.tournamentId) === String(currentTournament.id))
    );
    state.submissions = state.submissions.filter(
      (entry) => !(String(entry.gameId) === String(id) && String(entry.tournamentId) === String(currentTournament.id))
    );
    await saveState(state);
    return;
  }

  const { error } = await supabaseClient
    .from("games")
    .delete()
    .eq("id", id)
    .eq("tournament_id", currentTournament.id);
  if (error) throw error;
  clearHallAllTournamentsCache();
}

async function submitScore({ playerId, gameId, score, submittedByAdmin }) {
  const numericScore = Number(score);
  if (!playerId || !gameId || Number.isNaN(numericScore)) {
    throw new Error("Player, game, and score are required.");
  }

  const currentTournament = await getCurrentTournament();

  if (connectionStatus.mode === "local") {
    const state = await loadState();
    const player = state.players.find((row) => String(row.id) === String(playerId));
    const game = state.games.find(
      (row) => String(row.id) === String(gameId) && String(row.tournamentId) === String(currentTournament.id)
    );
    if (!player || !game) throw new Error("Player or game not found.");
    if (!game.isActive) throw new Error("This game is currently inactive.");

    const submission = {
      id: `local-score-${crypto.randomUUID()}`,
      playerId,
      playerName: player.name,
      gameId,
      gameName: game.name,
      tournamentId: currentTournament.id,
      score: numericScore,
      enteredBy: submittedByAdmin ? "admin" : "player",
      createdAt: new Date().toISOString(),
    };
    state.submissions.push(submission);
    await saveState(state);
    return submission;
  }

  const { data: game, error: gameError } = await supabaseClient
    .from("games")
    .select("is_active")
    .eq("id", gameId)
    .eq("tournament_id", currentTournament.id)
    .single();
  if (gameError) throw gameError;
  if (game?.is_active === false) throw new Error("This game is currently inactive.");

  const { data, error } = await supabaseClient
    .from("scores")
    .insert({
      tournament_id: currentTournament.id,
      player_id: playerId,
      game_id: gameId,
      score_value: numericScore,
      submitted_by_admin: submittedByAdmin === true,
    })
    .select("id,tournament_id,score_value,submitted_by_admin,created_at,player:players(id,name),game:games(id,name)")
    .single();
  if (error) throw error;
  clearHallAllTournamentsCache();

  return {
    id: data.id,
    tournamentId: data.tournament_id,
    playerId: data.player?.id,
    playerName: normalizeName(data.player?.name),
    gameId: data.game?.id,
    gameName: normalizeName(data.game?.name),
    score: Number(data.score_value),
    enteredBy: data.submitted_by_admin ? "admin" : "player",
    createdAt: data.created_at,
  };
}

async function deleteSubmission(id) {
  if (!id) throw new Error("Submission id is required.");
  const currentTournament = await getCurrentTournament();

  if (connectionStatus.mode === "local") {
    const state = await loadState();
    state.submissions = state.submissions.filter(
      (entry) => !(String(entry.id) === String(id) && String(entry.tournamentId) === String(currentTournament.id))
    );
    await saveState(state);
    return;
  }

  const { error } = await supabaseClient
    .from("scores")
    .delete()
    .eq("id", id)
    .eq("tournament_id", currentTournament.id);
  if (error) throw error;
  clearHallAllTournamentsCache();
}

function getActiveGames(state) {
  return getGamesSortedByName(state, { activeOnly: true });
}

function getGamesForTournament(state, tournamentId, { activeOnly = false } = {}) {
  return (state?.games || [])
    .filter((game) => (tournamentId ? String(game.tournamentId) === String(tournamentId) : false))
    .filter((game) => (activeOnly ? game.isActive !== false : true))
    .slice();
}

function getGamesSortedByName(state, { activeOnly = false, tournamentId } = {}) {
  const currentTournament = getCurrentTournamentFromState(state);
  const resolvedTournamentId = tournamentId || currentTournament?.id || null;
  return getGamesForTournament(state, resolvedTournamentId, { activeOnly })
    .slice()
    .sort((a, b) => gameNameCollator.compare(normalizeName(a?.name), normalizeName(b?.name)));
}


function getPlayerParticipationMap(state) {
  const map = new Map();
  for (const submission of state?.submissions || []) {
    const playerId = String(submission.playerId || "");
    if (!playerId) continue;
    if (!map.has(playerId)) {
      map.set(playerId, new Set());
    }
    map.get(playerId).add(String(submission.tournamentId || ""));
  }
  return map;
}

function getProfilePlayerOptions(state, { repeatOnly = false } = {}) {
  const tournamentsById = new Map((state?.tournaments || []).map((t) => [String(t.id), t]));
  const participation = getPlayerParticipationMap(state);

  return (state?.players || [])
    .map((player) => {
      const tournamentIds = [...(participation.get(String(player.id)) || new Set())].filter(Boolean);
      const mostRecentDate = tournamentIds.reduce((maxDate, tournamentId) => {
        const nextDate = getTournamentDateValue(tournamentsById.get(String(tournamentId)));
        return nextDate > maxDate ? nextDate : maxDate;
      }, Number.NEGATIVE_INFINITY);
      return {
        playerId: player.id,
        playerName: player.name,
        tournamentIds,
        tournamentCount: tournamentIds.length,
        mostRecentDate,
      };
    })
    .filter((row) => row.tournamentCount > 0)
    .filter((row) => (repeatOnly ? row.tournamentCount >= 2 : true))
    .sort((a, b) => {
      if (a.mostRecentDate !== b.mostRecentDate) return b.mostRecentDate - a.mostRecentDate;
      return String(a.playerName).localeCompare(String(b.playerName), undefined, {
        sensitivity: "base",
        numeric: true,
      });
    });
}

function getSubmissionsForTournament(state, tournamentId) {
  return (state?.submissions || []).filter((submission) =>
    tournamentId ? String(submission.tournamentId) === String(tournamentId) : false
  );
}

function getBestScoresByGameForTournament(state, tournamentId, { activeOnly = true } = {}) {
  const result = {};
  const games = getGamesForTournament(state, tournamentId, { activeOnly });
  const submissions = getSubmissionsForTournament(state, tournamentId);

  for (const game of games) {
    const filtered = submissions.filter((submission) => String(submission.gameId) === String(game.id));
    const bestByPlayer = new Map();

    for (const entry of filtered) {
      const existing = bestByPlayer.get(entry.playerId);
      if (
        !existing ||
        (game.direction === "higher" && entry.score > existing.score) ||
        (game.direction === "lower" && entry.score < existing.score)
      ) {
        bestByPlayer.set(entry.playerId, entry);
      }
    }

    const ranked = [...bestByPlayer.values()].sort((a, b) =>
      game.direction === "higher" ? b.score - a.score : a.score - b.score
    );
    result[game.id] = ranked;
  }

  return result;
}

function getBestScoresByGame(state) {
  const currentTournament = getCurrentTournamentFromState(state);
  return getBestScoresByGameForTournament(state, currentTournament?.id || null, { activeOnly: true });
}

function calculateGamePoints(rankedScores) {
  const k = rankedScores.length;
  const withPoints = [];
  let rank = 1;

  for (let i = 0; i < rankedScores.length; i += 1) {
    if (i > 0 && rankedScores[i].score !== rankedScores[i - 1].score) {
      rank = i + 1;
    }
    withPoints.push({
      ...rankedScores[i],
      rank,
      points: k - rank + 1,
    });
  }

  return withPoints;
}

function compareOverallRows(a, b) {
  return (
    b.points - a.points ||
    b.firstPlaceFinishes - a.firstPlaceFinishes ||
    b.secondPlaceFinishes - a.secondPlaceFinishes ||
    b.thirdPlaceFinishes - a.thirdPlaceFinishes ||
    String(a.player).localeCompare(String(b.player), undefined, { sensitivity: "base", numeric: true })
  );
}

function getOverallStandingsForTournament(state, tournamentId) {
  const participatingPlayerIds = new Set(
    getSubmissionsForTournament(state, tournamentId)
      .map((submission) => submission.playerId)
  );

  const totals = new Map();
  for (const player of state.players || []) {
    if (!participatingPlayerIds.has(player.id)) continue;
    totals.set(player.id, {
      player: player.name,
      points: 0,
      firstPlaceFinishes: 0,
      secondPlaceFinishes: 0,
      thirdPlaceFinishes: 0,
    });
  }

  const bestByGame = getBestScoresByGameForTournament(state, tournamentId, { activeOnly: true });
  for (const game of getGamesForTournament(state, tournamentId, { activeOnly: true })) {
    const scored = calculateGamePoints(bestByGame[game.id] || []);
    for (const row of scored) {
      if (!totals.has(row.playerId)) continue;
      totals.get(row.playerId).points += row.points;
      if (row.rank === 1) totals.get(row.playerId).firstPlaceFinishes += 1;
      if (row.rank === 2) totals.get(row.playerId).secondPlaceFinishes += 1;
      if (row.rank === 3) totals.get(row.playerId).thirdPlaceFinishes += 1;
    }
  }

  // Example tie scenario:
  // If Alex and Jamie both have 10 total points, Alex ranks higher when Alex has more game wins (rank 1 finishes).
  return [...totals.values()].sort(compareOverallRows);
}


function getTournamentDateValue(tournament) {
  if (!tournament?.startDate) return Number.NEGATIVE_INFINITY;
  const parsed = Date.parse(tournament.startDate);
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

function compareTournamentsByRecency(a, b) {
  const dateDiff = getTournamentDateValue(b) - getTournamentDateValue(a);
  if (dateDiff !== 0) return dateDiff;
  return String(a?.id || "").localeCompare(String(b?.id || ""), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function getRankedOverallRows(overallRows) {
  let rank = 1;
  return (overallRows || []).map((row, idx) => {
    const prev = overallRows[idx - 1];
    if (idx > 0 && compareOverallRows(row, prev) !== 0) {
      rank = idx + 1;
    }
    return { ...row, rank };
  });
}

function createTournamentStandingsCache(state) {
  const cache = new Map();
  return {
    get(tournamentId) {
      const key = String(tournamentId || "");
      if (!key) return [];
      if (!cache.has(key)) {
        const standings = getOverallStandingsForTournament(state, tournamentId);
        cache.set(key, getRankedOverallRows(standings));
      }
      return cache.get(key);
    },
  };
}

function getOverallStandings(state) {
  const currentTournament = getCurrentTournamentFromState(state);
  return getOverallStandingsForTournament(state, currentTournament?.id || null);
}

async function renderTVPage() {
  const host = document.getElementById("tvGrid");
  const updatedEl = document.getElementById("lastUpdated");
  if (!host || !updatedEl) return;

  try {
    const state = await loadState();
    host.innerHTML = "";
    ensureCurrentTournament(state);

    if (!connectionStatus.available) {
      host.innerHTML = `<article class="tv-card"><h2>Unavailable</h2><p>${escapeHtml(connectionStatus.message)}</p></article>`;
      return;
    }

    const bestByGame = getBestScoresByGame(state);

    getActiveGames(state).forEach((game) => {
      const logoUrl = getLogoUrl(game);
      const top3 = (bestByGame[game.id] || []).slice(0, 3);
      const scoresHtml = top3.length
        ? top3
            .map(
              (entry, idx) =>
                `<li><span class="rank">#${idx + 1}</span><span class="player">${escapeHtml(
                  entry.playerName
                )}</span><span class="score">${entry.score}</span></li>`
            )
            .join("")
        : '<li class="empty">No scores yet</li>';

      const logoHtml = logoUrl
        ? `<img class="tv-logo" src="${escapeHtml(logoUrl)}" alt="${escapeHtml(game.name)} logo" loading="lazy" />`
        : `<div class="tv-logo tv-logo-placeholder" aria-label="No logo available">${escapeHtml(
            getGameInitials(game.name)
          )}</div>`;

      const card = document.createElement("article");
      card.className = "tv-card";
      card.innerHTML = `
        <h2>${escapeHtml(game.name)}</h2>
        <div class="tv-logo-wrap">${logoHtml}</div>
        <p class="tv-direction">${
          game.direction === "higher" ? "Higher score wins" : "Lower score wins"
        }</p>
        <ol class="tv-scores">${scoresHtml}</ol>
      `;
      host.appendChild(card);
    });

    updatedEl.textContent = `Last updated: ${new Date().toLocaleTimeString()}`;
  } catch (error) {
    console.error(error);
    host.innerHTML = `<article class="tv-card"><h2>Unavailable</h2><p>Tournament database not reachable. Please contact admin.</p></article>`;
  }
}

function initTVPage() {
  if (!document.getElementById("tvGrid")) return;
  renderTVPage();
  window.setInterval(renderTVPage, 20000);
}

if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", () => {
    initializeStore().finally(() => {
      showConnectionBanner();
      initTVPage();
    });
  });
}

window.TournamentStore = {
  loadState,
  saveState,
  initializeStore,
  getConnectionStatus: () => ({ ...connectionStatus }),
  normalizeName,
  getLogoUrl,
  getGameInitials,
  getCurrentTournament,
  getCurrentTournamentFromState,
  ensureCurrentTournament,
  getActiveGames,
  getGamesForTournament,
  getGamesSortedByName,
  getPlayerParticipationMap,
  getProfilePlayerOptions,
  getSubmissionsForTournament,
  getBestScoresByGameForTournament,
  getBestScoresByGame,
  calculateGamePoints,
  getOverallStandingsForTournament,
  getOverallStandings,
  getTournamentDateValue,
  compareTournamentsByRecency,
  getRankedOverallRows,
  createTournamentStandingsCache,
  renderTVPage,
  escapeHtml,
  createTournament,
  setActiveTournament,
  addPlayer,
  updatePlayer,
  deletePlayer,
  addGame,
  updateGame,
  deleteGame,
  submitScore,
  deleteSubmission,
  fetchOfficialPodium,
  upsertOfficialPodium,
  clearOfficialPodium,
  fetchTournamentStandings,
  fetchPlayerStandingForTournament,
  tournamentHasOfficialStandings,
  getOfficialStandingsForTournamentFromState,
};
