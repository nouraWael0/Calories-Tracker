# Calorie Ledger

A single-page, offline-first PWA for tracking a weekly calorie budget —
built to look and feel like a paper ledger, not a diet app.

**Live app:** https://nouraWael0.github.io/Calories-Tracker/

## Screenshots

| Empty week | Logged week | Week settings |
|---|---|---|
| ![Empty week](screenshots/empty.png) | ![Logged week](screenshots/filled.png) | ![Week settings menu](screenshots/settings-menu.png) |

## How it works

You set a daily calorie target once. Every week is laid out as seven
rows (Sunday → Saturday) plus a **Ration** row at the bottom — the
week's overall daily average, not a raw total.

**Weekly budget redistribution.** The week's total budget is
`dailyTarget × 7`. Each time a day is locked in, the remaining budget
is split evenly across the days still open:

```
remainingBudget = (dailyTarget × 7) − sum(consumed for locked days)
newAllocated (per open day) = remainingBudget ÷ number of open days
```

So eating less than your target one day raises what's available on
the days after it, and vice versa — the live day always shows how much
you actually have left to eat *today*.

**Grading stays fixed.** Once a day is finished, its color/arrow is
graded against the flat daily target — never the redistributed
amount — so a day's grade always reflects your actual target, not
however the week's budget happened to get rebalanced around it.

- 🟩 green — 200+ calories under target
- 🟨 yellow — within ±200 of target
- 🟥 red — 200+ calories over target
- ✓ — exactly on target

**Days lock** automatically at midnight, or manually when you tap
"Set" and confirm. Locked days can still be edited later (with a
confirmation), and editing a past day only ever affects the days
*after* it — history never silently rewrites itself.

## Features

- **Single continuous page** — weeks stack from oldest (top) to newest
  (bottom), like a running notebook. No separate history screen.
- **Per-week settings (`⋮`)** — change a week's target, wipe its data,
  bulk-fill every day to the target, or delete the week entirely.
- **Log a past week** — backfill an entire week's data freely, in any
  order, no locking required.
- **Export / Import** — back up all data to a plain `.txt` file and
  restore it later. Needed because installing this as a Home Screen
  app on iOS uses separate storage from Safari, so every reinstall
  after a code update needs a fresh import.
- **Fully offline** — a service worker caches the app shell; all data
  lives in `localStorage` on-device only, never sent anywhere.

## Tech stack

Plain HTML / CSS / JavaScript — no frameworks, no build step.

- `index.html` — page shell
- `style.css` — ledger-style theming
- `storage.js` — data model + the redistribution math
- `app.js` — rendering + all UI logic
- `manifest.json` + `service-worker.js` — PWA/offline support

## Running locally

```bash
git clone https://github.com/nouraWael0/Calories-Tracker.git
cd Calories-Tracker
python -m http.server 8000
```

Then open `http://localhost:8000`. Or, in VS Code, right-click
`index.html` → **Open with Live Server**.

## Deploying updates

Replace the changed files, then:

```bash
git add .
git commit -m "..."
git push
```

GitHub Pages picks up the change automatically within a minute or two.

## Export file format

```
yyyy-mm-dd
Daily Target = 1200
Sunday: 1300
Monday: 1100
Tuesday:
Wednesday: 1100
Thursday: 1200
Friday: 1300
Saturday: 1200
```

One block per week, separated by a blank line. An empty value after
the colon means that day hasn't been logged yet.
