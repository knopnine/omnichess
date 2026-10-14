# OmniChess

A static, local chess game for two to six armies. Play on one shared device, mix human and AI seats, or watch an all-AI match. The interface uses warm ivory, walnut, and brass, with Source Serif 4 and Source Sans 3 bundled locally.

## Run locally

Use Node.js 24 LTS and npm. Dependencies are pinned by `package-lock.json`.

```sh
npm ci
npm run dev
npm test
npm run build
npm run preview
```

Vite builds into `dist`. Open the HTTP address printed by the dev or preview command. ES modules require HTTP hosting; opening `index.html` with a file URL is unsupported.

## Screens

- `#/`: introduction, Play a Match, Watch AI Play, and saved-match resume.
- `#/setup`: board preview, 2–6 armies, controllers, AI difficulty, promotion, and multiplayer rules.
- `#/play`: board, ranked armies, move history, keyboard moves, and match controls.
- `#/guide`: rules, geometry, estimates, and saving behavior.

The old `/omnichess_modern.html` URL redirects to `/`. The original prototype is preserved in `legacy/` and is not included in production assets.

## Rules and controls

Two-player mode uses standard placement, legal checks, castling, en passant, and all four promotions. Kings cannot be captured. Stalemate, threefold repetition, 100 half-moves without pawn movement/capture, and common insufficient-material positions automatically draw. Checkmate takes priority over the move-count rule. This is a simplified casual draw policy, not full tournament adjudication; arbitrary dead positions are not exhaustively detected.

Three to six players retain radial sector movement and the central diagonal branches. Conquest converts defeated armies; otherwise they freeze or disappear. First-checkmate also ends immediately on direct king capture. Stalemate eliminates an army in multiplayer. Converted pawns follow their new owner's sector-based direction.

Arrow keys move the board cursor, Enter or Space selects/moves, and Escape clears selection. Legal moves use dots; captures use dashed rings. Human-mode Undo removes the most recent human move and its following AI replies. Spectator Undo removes one ply and remains paused. Only the most recent 35 snapshots are retained, so a human decision older than that cannot be undone.

Settings and Guide suspend AI without changing its previous pause state. Leaving for Home or Setup pauses the match. Returning from Home/Setup or restoring a save keeps AI paused until Resume AI is pressed; human moves remain available. Returning directly from Guide restores the prior pause state. Step performs one AI move and stays paused. Speed presets are delays between moves; AI computation adds time.

Multiplayer victory/conquest changes apply live. Undo restores positions under currently selected rules and preserves controllers, difficulty, and speed. Starting a match or resetting after moves requires confirmation before replacing the saved match.

## Win estimates

Rankings use a deterministic heuristic comparing material, mobility, center occupation, pawn advancement, attacked pieces, and king safety. A softmax converts scores into relative shares; rounding preserves a displayed total of 100%. Ties follow original army order. Eliminated armies show 0%, the declared winner 100%, and drawn matches show Draw. These are uncalibrated position estimates, not measured probabilities, and do not predict draws.

## Saves

The versioned `omnichess.match` local-storage slot contains settings, committed board state, rule metadata, up to 35 undo snapshots, and the recent move log. A pending promotion is not saved until chosen. Invalid or unsupported saves are left untouched; that session can play without writing over them. Storage failures do not interrupt play.

Saves belong to one browser and origin. They do not sync across devices or between Vercel preview/production URLs. No accounts, cloud saving, online multiplayer, or telemetry are included.

## Deploy to Vercel later

The included `vercel.json` specifies the Vite preset, `npm run build`, and output directory `dist`. The package selects Node.js 24, which [Vercel supports for builds](https://vercel.com/changelog/node-js-24-lts-is-now-generally-available-for-builds-and-functions). No environment variables, backend, or database are needed. Hash routes require no rewrite rules.

1. Push this repository to a Git provider when ready.
2. Import it into Vercel with the repository root as the project root.
3. Create a preview deployment and check navigation, all board variants, AI controls, and reload recovery.
4. Promote the verified build to production. Keep the previous deployment available for rollback.

Nothing is published by the implementation or build scripts. Production includes only the generated site and local assets, not the tests or original prototype.

## Project structure

`src/engine/` contains DOM-independent topology, rules, game state, AI, estimation, and persistence. `src/ui/` contains canvas drawing and screen/control orchestration. `tests/` covers engine fixtures, perft, timers, persistence, rankings, and DOM interactions.

Fonts are distributed under the SIL Open Font License; copies are included with the public assets. Chess icons are local SVG paths. There are no runtime CDN requests.
