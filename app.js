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
  players: ["Alex", "Jamie", "Riley"].map((name, idx) => ({ id: `local-player-${idx + 1}`, name })),
  games: defaultGames.map((game, idx) => ({ id: `local-game-${idx + 1}`, ...game, sortOrder: idx + 1, isActive: true })),
  submissions: [],
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
    return {
      adminCode: parsed.adminCode || DEFAULT_ADMIN_CODE,
      overallRevealed: parsed.overallRevealed === true,
      players: Array.isArray(parsed.players)
        ? parsed.players.map((name, idx) => ({ id: `local-player-${idx + 1}`, name: normalizeName(name) })).filter((p) => p.name)
        : [],
      games: Array.isArray(parsed.games)
        ? parsed.games
            .map((game, idx) => normalizeGame({ ...game, id: `local-game-${idx + 1}`, sortOrder: idx + 1, isActive: true }))
            .filter((game) => game.name)
        : [],
      submissions: Array.isArray(parsed.submissions)
        ? parsed.submissions
            .map((entry, idx) => {
              const playerName = normalizeName(entry.player);
              const gameName = normalizeName(entry.game);
              const player = parsed.players?.find((p) => normalizeName(p) === playerName);
              const game = parsed.games?.find((g) => normalizeName(g?.name) === gameName);
              return {
                id: `local-score-${idx + 1}`,
                playerId: player ? `local-player-${parsed.players.indexOf(player) + 1}` : undefined,
                playerName,
                gameId: game ? `local-game-${parsed.games.indexOf(game) + 1}` : undefined,
                gameName,
                score: Number(entry.score),
                enteredBy: entry.enteredBy || "player",
                createdAt: entry.createdAt || new Date().toISOString(),
              };
            })
            .filter((entry) => Number.isFinite(entry.score) && entry.playerName && entry.gameName)
        : [],
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
    players: state.players.map((player) => player.name),
    games: state.games.map((game) => ({
      name: game.name,
      direction: game.direction,
      min: game.min,
      max: game.max,
      logoUrl: game.logoUrl,
    })),
    submissions: state.submissions.map((entry) => ({
      player: entry.playerName,
      game: entry.gameName,
      score: entry.score,
      enteredBy: entry.enteredBy,
      createdAt: entry.createdAt,
    })),
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

async function loadState() {
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
      players: [],
      games: [],
      submissions: [],
      adminCode: prefs.adminCode,
      overallRevealed: prefs.overallRevealed,
    };
  }

  const [playersResp, gamesResp, scoresResp] = await Promise.all([
    supabaseClient.from("players").select("id,name").order("name", { ascending: true }),
    supabaseClient
      .from("games")
      .select("id,name,scoring_direction,min_score,max_score,logo_url,sort_order,is_active")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabaseClient
      .from("scores")
      .select("id,score_value,submitted_by_admin,created_at,player:players(id,name),game:games(id,name)")
      .order("created_at", { ascending: true }),
  ]);

  if (playersResp.error || gamesResp.error || scoresResp.error) {
    throw playersResp.error || gamesResp.error || scoresResp.error;
  }

  const players = (playersResp.data || []).map((row) => ({ id: row.id, name: normalizeName(row.name) })).filter((p) => p.name);
  const games = (gamesResp.data || [])
    .map((row) =>
      normalizeGame({
        id: row.id,
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

  const submissions = (scoresResp.data || [])
    .map((row) => ({
      id: row.id,
      playerId: row.player?.id,
      playerName: normalizeName(row.player?.name),
      gameId: row.game?.id,
      gameName: normalizeName(row.game?.name),
      score: Number(row.score_value),
      enteredBy: row.submitted_by_admin ? "admin" : "player",
      createdAt: row.created_at,
    }))
    .filter((entry) => entry.playerName && entry.gameName && Number.isFinite(entry.score));

  return {
    players,
    games,
    submissions,
    adminCode: prefs.adminCode,
    overallRevealed: prefs.overallRevealed,
  };
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
}

async function addGame(gameInput) {
  const game = normalizeGame(gameInput);
  if (!game.name || Number.isNaN(game.min) || Number.isNaN(game.max) || game.min > game.max) {
    throw new Error("Provide valid game name and min/max.");
  }

  if (connectionStatus.mode === "local") {
    const state = await loadState();
    const duplicate = state.games.some((row) => row.name.toLowerCase() === game.name.toLowerCase());
    if (duplicate) throw new Error("Game name already exists.");
    state.games.push({ ...game, id: `local-game-${crypto.randomUUID()}` });
    await saveState(state);
    return;
  }

  const { data: games, error: maxSortError } = await supabaseClient
    .from("games")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1);
  if (maxSortError) throw maxSortError;

  const nextSort = Number(games?.[0]?.sort_order || 0) + 1;
  const { error } = await supabaseClient.from("games").insert({
    name: game.name,
    scoring_direction: game.direction,
    min_score: game.min,
    max_score: game.max,
    logo_url: game.logoUrl || null,
    sort_order: nextSort,
    is_active: true,
  });
  if (error) throw error;
}

async function updateGame(id, gameInput) {
  const game = normalizeGame(gameInput);
  if (!game.name || Number.isNaN(game.min) || Number.isNaN(game.max) || game.min > game.max) {
    throw new Error("Provide valid game name and min/max.");
  }

  if (connectionStatus.mode === "local") {
    const state = await loadState();
    const row = state.games.find((entry) => entry.id === id);
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
    .eq("id", id);
  if (error) throw error;
}

async function deleteGame(id) {
  if (connectionStatus.mode === "local") {
    const state = await loadState();
    state.games = state.games.filter((game) => game.id !== id);
    state.submissions = state.submissions.filter((entry) => entry.gameId !== id);
    await saveState(state);
    return;
  }

  const { error } = await supabaseClient.from("games").delete().eq("id", id);
  if (error) throw error;
}

async function submitScore({ playerId, gameId, score, submittedByAdmin }) {
  const numericScore = Number(score);
  if (!playerId || !gameId || Number.isNaN(numericScore)) {
    throw new Error("Player, game, and score are required.");
  }

  if (connectionStatus.mode === "local") {
    const state = await loadState();
    const player = state.players.find((row) => row.id === playerId);
    const game = state.games.find((row) => row.id === gameId);
    if (!player || !game) throw new Error("Player or game not found.");
    if (!game.isActive) throw new Error("This game is currently inactive.");

    state.submissions.push({
      id: `local-score-${crypto.randomUUID()}`,
      playerId,
      playerName: player.name,
      gameId,
      gameName: game.name,
      score: numericScore,
      enteredBy: submittedByAdmin ? "admin" : "player",
      createdAt: new Date().toISOString(),
    });
    await saveState(state);
    return;
  }

  const { data: game, error: gameError } = await supabaseClient
    .from("games")
    .select("is_active")
    .eq("id", gameId)
    .single();
  if (gameError) throw gameError;
  if (game?.is_active === false) throw new Error("This game is currently inactive.");

  const { error } = await supabaseClient.from("scores").insert({
    player_id: playerId,
    game_id: gameId,
    score_value: numericScore,
    submitted_by_admin: submittedByAdmin === true,
  });
  if (error) throw error;
}

function getActiveGames(state) {
  return getGamesSortedByName(state, { activeOnly: true });
}

function getGamesSortedByName(state, { activeOnly = false } = {}) {
  return (state?.games || [])
    .filter((game) => (activeOnly ? game.isActive !== false : true))
    .slice()
    .sort((a, b) => gameNameCollator.compare(normalizeName(a?.name), normalizeName(b?.name)));
}

function getBestScoresByGame(state) {
  const result = {};

  for (const game of getActiveGames(state)) {
    const filtered = state.submissions.filter((submission) => submission.gameId === game.id);
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

function getOverallStandings(state) {
  const totals = new Map();
  for (const player of state.players) {
    totals.set(player.id, { player: player.name, points: 0 });
  }

  const bestByGame = getBestScoresByGame(state);
  for (const game of getActiveGames(state)) {
    const scored = calculateGamePoints(bestByGame[game.id] || []);
    for (const row of scored) {
      if (!totals.has(row.playerId)) continue;
      totals.get(row.playerId).points += row.points;
    }
  }

  return [...totals.values()].sort((a, b) => b.points - a.points || a.player.localeCompare(b.player));
}

async function renderTVPage() {
  const host = document.getElementById("tvGrid");
  const updatedEl = document.getElementById("lastUpdated");
  if (!host || !updatedEl) return;

  try {
    const state = await loadState();
    host.innerHTML = "";

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
  getActiveGames,
  getGamesSortedByName,
  getBestScoresByGame,
  calculateGamePoints,
  getOverallStandings,
  renderTVPage,
  escapeHtml,
  addPlayer,
  updatePlayer,
  deletePlayer,
  addGame,
  updateGame,
  deleteGame,
  submitScore,
};
