# SkillMill Arcade Tournament

A simple static website for running an arcade tournament with shared data across devices using Supabase.

## What this site does

- One shared URL/QR code for everyone.
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

This creates the required tables: `players`, `games`, and `scores` (plus optional `best_scores` view).

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
- `/tv.html` — TV-friendly top-3 per game.
- `/admin.html` — manage players/games and admin score entry.
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
