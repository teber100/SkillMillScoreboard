const STORAGE_KEY = "skillmill_tournament_v1";
const DEFAULT_ADMIN_CODE = "2468";
const DEFAULT_LOGO_PLACEHOLDER =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='320' height='180' viewBox='0 0 320 180'>
      <rect width='320' height='180' fill='#0b1f34'/>
      <rect x='10' y='10' width='300' height='160' rx='12' fill='none' stroke='#2f5f91' stroke-width='4'/>
      <text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='#9cb5d6' font-family='Arial, sans-serif' font-size='24' font-weight='700'>NO LOGO</text>
    </svg>`
  );

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
  adminCode: DEFAULT_ADMIN_CODE,
  players: ["Alex", "Jamie", "Riley"],
  games: defaultGames,
  submissions: [],
  overallRevealed: false,
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
      games: Array.isArray(parsed.games)
        ? parsed.games.map((g) => ({
            name: g.name,
            direction: g.direction === "lower" ? "lower" : "higher",
            min: Number(g.min),
            max: Number(g.max),
            logoUrl:
              typeof g.logoUrl === "string" ? g.logoUrl : typeof g.logoDataUrl === "string" ? g.logoDataUrl : "",
          }))
        : [],
      submissions: Array.isArray(parsed.submissions) ? parsed.submissions : [],
      overallRevealed: parsed.overallRevealed === true,
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

function getLogoUrl(game) {
  return normalizeName(game.logoUrl || game.logoDataUrl || "") || DEFAULT_LOGO_PLACEHOLDER;
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

window.TournamentStore = {
  loadState,
  saveState,
  normalizeName,
  getLogoUrl,
  getBestScoresByGame,
  calculateGamePoints,
  getOverallStandings,
};
