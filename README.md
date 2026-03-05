# SkillMill Arcade Tournament

A simple static website for running an arcade tournament with shared data across devices using Supabase.

## What this site does

- One shared URL/QR code for everyone.
- Multiple tournaments (years) with exactly one active tournament at a time.
- Games and scores are isolated per tournament, while players remain global.
- Optional official tournament podiums (1st/2nd/3rd) for legacy years where scoring rules differed.
- Players submit scores by selecting:
  - player name (from dropdown)
  - game (from dropdown)
  - score (number)
- No individual logins.
- Admin page protected by one shared admin code.
- Per-game leaderboard and overall standings with points.
- TV display page for per-game top 3.

## How scoring works

1. A player can submit multiple scores for the same game.
2. Only the **best** score per player per game counts:
   - **Higher-is-better** games: highest score counts.
   - **Lower-is-better** games: lowest score counts.
3. Per-game points:
   - If `K` players have a score in that game:
   - 1st place = `K` points, 2nd = `K-1`, ..., last = `1`.
4. Ties use standard competition ranking:
   - Tied players share the same rank and same points.
   - Next rank is skipped.
5. Overall standings = total points across all games.

## How to deactivate a game if it breaks

1. Go to `/admin.html` and unlock admin tools.
2. In **Manage Games**, click **Set Inactive** for the broken machine.
3. If repaired, click **Set Active** to bring it back.

What happens when a game is inactive:
- It is hidden from the score submission dropdown.
- Any attempted submission to that game is blocked with: **“This game is currently inactive.”**
- It is excluded from per-game points, overall standings, and TV display cards.
- Existing score records remain in the database and are reused automatically if reactivated.


## Undo and admin score deletion

### Player submit confirmation + 30-second Undo

- After each successful submission on `/submit.html`, players see a confirmation panel showing:
  - player name
  - game name
  - submitted score value
  - submission timestamp
- The panel includes an **Undo (30s)** button.
- If Undo is clicked within 30 seconds, that exact inserted `scores` row is deleted by its `id` and the form is reset.
- After 30 seconds, Undo expires and the panel shows **Undo expired.**

### Admin score management (delete only)

- On `/admin.html` (after entering admin code), the **Score Management** section allows:
  - selecting a player from a dropdown
  - viewing their latest 25 submissions (timestamp, game, score)
  - deleting any listed submission by score `id`
- There is **no admin score edit** action, only delete.
- Deletions apply immediately because leaderboards and TV data are always computed from current DB records.

## Admin code (important)

Default admin code is: **2468**

To change it, open `app.js` and edit `DEFAULT_ADMIN_CODE`.

---

## Supabase + Vercel setup (non-coder guide)

### 1) Create a Supabase project

1. Go to <https://supabase.com> and create a new project.
2. Wait for it to finish provisioning.

### 2) Create tables in Supabase

1. In Supabase, open **SQL Editor**.
2. Open the repo file `supabase-schema.sql`.
3. Copy/paste the SQL into Supabase SQL Editor.
4. Run it once.

For a brand new project, this creates `players`, `tournaments`, `games`, and `scores` (plus optional `best_scores` view).

For an existing project already in production, run `supabase-migration-tournaments.sql` first to backfill all existing games/scores into the default tournament.

Then run `supabase-migration-official-results.sql` once to add the `tournament_results` table for legacy official podium entries.

### 3) Get your Supabase project keys

In Supabase project settings, copy:

- **Project URL** (for `SUPABASE_URL`)
- **anon/public key** (for `SUPABASE_ANON_KEY`)

> Only use the anon/public key in this app. Do **not** use service role keys client-side.

### 4) Add environment variables in Vercel

1. In Vercel, open your project.
2. Go to **Settings → Environment Variables**.
3. Add:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
4. Save.

(Also supported: `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`.)

### 5) Redeploy

1. Trigger a new deployment in Vercel (or push a new commit).
2. Open the live site after deploy completes.

### 6) Verify shared data across devices

1. On device A, add a player/game or submit score.
2. On device B, open the same page and refresh.
3. Confirm the same players/games/scores appear.

---

## Pages

- `/index.html` — Home/menu.
- `/submit.html` — player score entry.
- `/leaderboards.html` — per-game + overall standings.
- `/hall.html` — historical champions and all-time records by game.
- `/tv.html` — TV-friendly top-3 per game.
- `/admin.html` — manage players/games and admin score entry.
- `/admin.html` — also includes **Official Results (Legacy Winners)** for saving official podiums per tournament.
- `/results.html` — admin reveal/hide control for overall standings.

---

## Troubleshooting

### “Tournament database not configured” or local mode banner

- If Supabase env vars are missing, the app shows a warning and runs in **local mode**.
- Local mode stores data only on that one device/browser (for temporary testing).
- To fix shared data: add Vercel env vars and redeploy.

### How to confirm app is using Supabase (not local mode)

- You should **not** see the local mode warning banner.
- Add a player or score on one device and verify it appears on another device.
- In browser DevTools Network tab, you should see requests to `/api/config` and Supabase endpoints.

### Database unreachable errors

- If Supabase is unreachable or keys are invalid, pages show a friendly “contact admin” message.
- Check Vercel logs:
  - Vercel project → **Deployments** → select latest deployment → **Functions** logs (for `/api/config`)
  - Also check browser console for client-side connection errors.

---

## TV display and game logos

- Use `/admin.html` to set each game’s logo URL.
- If no logo URL exists, TV view shows a placeholder.
- `/tv.html` auto-refreshes every 20 seconds.
- For events, open `/tv.html` on TV and use browser full-screen mode.


## Running next year's tournament (non-coder checklist)

1. In Supabase SQL Editor, run `supabase-migration-tournaments.sql` (existing deployments) or `supabase-schema.sql` (new deployments).
2. Verify `tournaments` contains the default row (`Skill Mill 2026`) and that existing `games`/`scores` now have `tournament_id` values.
3. Open `/admin.html` and unlock admin tools.
4. In **Current Tournament**:
   - Enter new name (example: `Skill Mill 2027`), optional date.
   - Choose **Clone games from** previous tournament (optional but recommended).
   - Click **Create Tournament**.
5. Select the new tournament and click **Set Active**.
6. Edit this year’s games (ranges, logos, active/inactive) in **Manage Games**.

How current tournament is determined:
- The app reads `tournaments` and selects the single row where `status = 'active'`.
- Submit/TV/leaderboards/results/admin game management all scope queries to that active tournament.
- Players remain global and are shared across all tournaments.

---

## Legacy official winners (2016–2021 support)

Use this when a historical tournament used legacy/team scoring rules and computed standings should not be treated as final winners.

1. Run `supabase-migration-official-results.sql` once in Supabase SQL Editor.
2. Open `/admin.html` and unlock admin tools.
3. In **Official Results (Legacy Winners)**:
   - Select the tournament.
   - Choose Champion (1st), 2nd place, and 3rd place.
   - Optionally add notes describing the legacy scoring context.
   - Click **Save Official Podium**.
4. To remove legacy overrides for a tournament, click **Clear Official Podium**.

How Hall of Champions decides what to show:
- If all 3 `tournament_results` places exist for a tournament, Hall displays those winners with **Official (legacy scoring)**.
- If official rows do not exist, Hall computes winners from standard points and labels it **Computed (standard scoring)**.
- All-time game records continue to use raw score submissions only.
