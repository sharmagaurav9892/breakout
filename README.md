# Breakout

A classic brick-breaker with smooth motion, a clean emerald UI, and a Top‑3 leaderboard. Pure HTML / CSS / JS — no server, no build step, no dependencies.

## Quick start

Just open `index.html` in a browser.

If you prefer serving it locally (some browsers restrict `file://` for things like fonts), any one‑liner static server works, e.g.:

```bash
python3 -m http.server 3000
# then open http://localhost:3000
```

## How to play

- Smash all 54 bricks (6 rows × 9 columns) to clear the level.
- Each row scores differently — the top (red) row is worth 7, working down to 2 for the bottom (blue) row.
- The angle the ball leaves the paddle depends on where it hits — center sends it straight up, edges deflect it more steeply.
- The ball starts stuck to the paddle. Press <kbd>Space</kbd> to launch.
- Drop the ball off the bottom and you lose a life. Lose all 3 and it's game over.
- Clearing every brick advances you to the next level — the ball speeds up a notch each time.

## How scores are stored

Everything is stored in this browser's `localStorage`:

| Key | What |
| --- | ---- |
| `breakout.leaderboard` | The Top 3 leaderboard. |
| `breakout.player` | Your current player name on this device. |

Clearing site data (or the **Clear** button in the leaderboard) wipes scores. Scores are per‑browser/per‑device — they don't sync across machines.

## Controls

| Key                              | Action            |
| -------------------------------- | ----------------- |
| `←` `→` (or `A` `D`)             | Move paddle       |
| `Space`                          | Launch / Pause    |
| `R`                              | Restart           |
| **Change** (top right)           | Switch player     |
| **Clear** (leaderboard header)   | Wipe Top 3        |

Notes:

- The tab auto-pauses when hidden, so you don't lose a run by alt-tabbing.
- On touch devices, press and hold the left/right buttons to move the paddle. The round button on the left toggles between **launch** (when the ball is stuck) and **pause / play**.

## Files

```
breakout/
├── index.html       # Markup
├── styles.css       # Theme
├── game.js          # Game loop, rendering, input, leaderboard
└── README.md
```
