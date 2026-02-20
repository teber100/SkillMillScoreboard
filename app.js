const STORAGE_KEY = "skillmill_tournament_v1";
const DEFAULT_ADMIN_CODE = "2468";

const defaultGames = [
  { name: "Pac-Man", direction: "higher", min: 0, max: 300000 },
  { name: "Galaga", direction: "higher", min: 0, max: 999999 },
  { name: "Donkey Kong", direction: "higher", min: 0, max: 250000 },
  { name: "Street Fighter II", direction: "higher", min: 0, max: 99 },
  { name: "NBA Jam", direction: "higher", min: 0, max: 200 },
  { name: "Mortal Kombat", direction: "higher", min: 0, max: 99 },
  { name: "Pinball", direction: "higher", min: 0, max: 5000000 },
  { name: "Skee-Ball", direction: "higher", min: 0, max: 100000 },
  { name: "Air Hockey", direction: "higher", min: 0, max: 21 },
  { name: "Mario Kart", direction: "higher", min: 0, max: 15 },
  { name: "Daytona USA", direction: "higher", min: 0, max: 9999 },
  { name: "Time Crisis", direction: "higher", min: 0, max: 999999 },
  { name: "Dance Dance Revolution", direction: "higher", min: 0, max: 1000000 },
  { name: "Whac-A-Mole", direction: "higher", min: 0, max: 1000 },
  { name: "Big Buck Hunter", direction: "higher", min: 0, max: 99999 },
  { name: "Golden Tee", direction: "lower", min: -30, max: 30 },
  { name: "Tetris", direction: "higher", min: 0, max: 999999 },
];

const defaultState = {
  adminCode: DEFAULT_ADMIN_CODE,
  players: ["Alex", "Jamie", "Riley"],
  games: defaultGames,
  submissions: [],
};

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultState));
    return structuredClone(defaultState);
  }
  try {
    const parsed = JSON.parse(raw);
    return {
      adminCode: parsed.adminCode || DEFAULT_ADMIN_CODE,
      players: Array.isArray(parsed.players) ? parsed.players : [],
      games: Array.isArray(parsed.games) ? parsed.games : [],
      submissions: Array.isArray(parsed.submissions) ? parsed.submissions : [],
    };
  } catch {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultState));
    return structuredClone(defaultState);
  }
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function normalizeName(name) {
  return String(name || "").trim();
}

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

function getBestScoresByGame(state) {
  const result = {};

  for (const game of state.games) {
    const filtered = state.submissions.filter((s) => s.game === game.name);
    const bestByPlayer = new Map();

    for (const entry of filtered) {
      const existing = bestByPlayer.get(entry.player);
      if (
        !existing ||
        (game.direction === "higher" && entry.score > existing.score) ||
        (game.direction === "lower" && entry.score < existing.score)
      ) {
        bestByPlayer.set(entry.player, entry);
      }
    }

    const ranked = [...bestByPlayer.values()].sort((a, b) =>
      game.direction === "higher" ? b.score - a.score : a.score - b.score
    );
    result[game.name] = ranked;
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
    totals.set(player, 0);
  }

  const bestByGame = getBestScoresByGame(state);
  for (const game of state.games) {
    const scored = calculateGamePoints(bestByGame[game.name] || []);
    for (const row of scored) {
      totals.set(row.player, (totals.get(row.player) || 0) + row.points);
    }
  }

  return [...totals.entries()]
    .map(([player, points]) => ({ player, points }))
    .sort((a, b) => b.points - a.points || a.player.localeCompare(b.player));
}

function renderTVPage() {
  const host = document.getElementById("tvGrid");
  const updatedEl = document.getElementById("lastUpdated");
  if (!host || !updatedEl) {
    return;
  }

  const state = loadState();
  const bestByGame = getBestScoresByGame(state);
  host.innerHTML = "";

  state.games.forEach((game) => {
    const logoUrl = getLogoUrl(game);
    const top3 = (bestByGame[game.name] || []).slice(0, 3);
    const scoresHtml = top3.length
      ? top3
          .map(
            (entry, idx) =>
              `<li><span class="rank">#${idx + 1}</span><span class="player">${escapeHtml(
                entry.player
              )}</span><span class="score">${entry.score}</span></li>`
          )
          .join("")
      : '<li class="empty">No scores yet</li>';

    const logoHtml = logoUrl
      ? `<img class="tv-logo" src="${escapeHtml(logoUrl)}" alt="${escapeHtml(game.name)} logo" loading="lazy" />`
      : `<div class="tv-logo tv-logo-placeholder" aria-label="No logo available">${escapeHtml(
          game.name
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((chunk) => chunk[0]?.toUpperCase() || "")
            .join("") || "🎮"
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
}

function initTVPage() {
  if (!document.getElementById("tvGrid")) {
    return;
  }
  renderTVPage();
  window.setInterval(renderTVPage, 20000);
}

if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", initTVPage);
}

window.TournamentStore = {
  loadState,
  saveState,
  normalizeName,
  getLogoUrl,
  getBestScoresByGame,
  calculateGamePoints,
  getOverallStandings,
  renderTVPage,
};
