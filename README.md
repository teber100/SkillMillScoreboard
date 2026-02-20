# SkillMill Arcade Tournament (Simple Website)

Simple mobile-friendly site for running a local arcade tournament.

## Pages
- `/index.html` — Home menu (use this for your single QR code)
- `/submit.html` — Player score entry
- `/tv.html` — TV display (all games, logo, Top 3, auto-refresh every 20s)
- `/leaderboards.html` — Public per-game leaderboards only
- `/admin.html` — Admin tools (players, games, logo URLs, admin score entry, reveal toggle)
- `/results.html` — Admin-only overall standings

## TV mode instructions
1. Open `/tv.html` on the TV-connected browser.
2. Full-screen the browser:
   - Windows: `F11`
   - Mac: `Ctrl + Cmd + F`
3. Leave it open; it refreshes every 20 seconds.

## Add game logos quickly
1. Open `/admin.html` and unlock with admin code (`2468` by default).
2. In **Manage Games**, paste a logo image URL.
3. Click **Save** on that game.
4. If no logo URL is set, TV mode shows a placeholder.

## Keep overall winner secret
- Public pages do not show overall standings.
- Use `/admin.html` → **Overall Results Controls** to toggle reveal ON/OFF.
- Use `/results.html` (admin code required) to display overall standings.
