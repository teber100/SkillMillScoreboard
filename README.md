# SkillMill Arcade Tournament (Simple Website)

This is a very simple, mobile-friendly website for running a local arcade tournament with ~20–30 friends.

## What this site does

- One shared URL/QR code for everyone.
- Players submit scores by selecting:
  - player name (from dropdown)
  - game (from dropdown)
  - score (number)
- No individual logins.
- Admin page protected by one shared admin code.
- Per-game leaderboard and overall standings with points.

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

To change it, open `app.js` and edit:

- `DEFAULT_ADMIN_CODE = "2468"`

Then redeploy.

## Pages and what they are for

- `/index.html` (Home)
  - Main menu page linked from your QR code.
- `/submit.html` (Player score entry)
  - Players submit scores.
  - If score is outside expected min/max for a game, site shows warning and asks:
    - **Fix it**
    - **Submit anyway**
- `/leaderboards.html` (Public standings)
  - Overall standings (total points).
  - Per-game rankings, best score, points.
- `/admin.html` (Admin tools)
  - Enter shared admin code to unlock.
  - Add/edit/delete players.
  - Add/edit/delete games (name, higher/lower, min/max).
  - Submit scores on behalf of players.

## Click-by-click: Publish on Vercel with GitHub (non-coder guide)

### Part A — Put this project in GitHub

1. Create a GitHub account (if you don’t have one): <https://github.com>
2. Click **New repository**.
3. Name it something like `arcade-tournament`.
4. Set it to Public or Private (your choice).
5. Click **Create repository**.
6. Upload these files into that repo.
   - Easiest way: click **Add file** → **Upload files**, drag all project files, commit.

### Part B — Deploy on Vercel

1. Go to <https://vercel.com> and log in (or create account).
2. Click **Add New...** → **Project**.
3. Connect your GitHub account (if prompted).
4. Select your repository.
5. Vercel detects this as a static site automatically.
6. Click **Deploy**.
7. Wait for build/deploy to finish.
8. Click **Visit** to open your live website.

### Part C — Make the single QR code

1. Copy your Vercel live URL (for example, `https://your-site.vercel.app`).
2. Use any QR generator website.
3. Create one QR code pointing to your main URL (`/index.html` or root URL).
4. Print and place it in your arcade space.

## Tournament setup checklist (recommended)

1. Open `/admin.html`.
2. Enter admin code.
3. Add all player names first.
4. Verify/edit the 17 games.
5. Set game directions correctly:
   - Most games: Higher is better.
   - Golden Tee: Lower is better.
6. Set realistic min/max ranges per game.
7. Optionally submit a test score.
8. Open `/leaderboards.html` to verify it looks right.
9. Start tournament.

## During tournament operations

- Players use only `/submit.html`.
- Admin uses `/admin.html` to:
  - fix typos in names
  - tune game ranges
  - enter scores for players without phones
- Anyone can view `/leaderboards.html`.

## Notes

- Data is stored in each browser’s local storage.
- If you want one shared database across all phones, you’ll need a backend (not included in this simple version).


## TV display and game logos

- Open `/admin.html`, unlock admin, then add or edit games to set a **Logo URL (optional)**.
- Each game row shows a small preview of the current logo; if no URL is set (or the URL fails), the app uses a built-in placeholder image.
- Open `/tv.html` for the TV mode view. It shows **Top 3 per game only** (no overall standings) and auto-refreshes every 20 seconds.
- For a full-screen display, open `/tv.html` on the TV device and use browser full-screen mode (usually `F11` or presentation mode).
