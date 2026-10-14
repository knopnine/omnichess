# Release verification

Verified on 14 October 2026 using Node.js 24 and the Vite production preview. No remote repository or deployment was created.

## Automated checks

- All 81 engine, timer, persistence, geometry, and DOM tests pass.
- Engine perft: 20, 400, and 8,902 from the standard initial position.
- Coverage includes all player counts, king safety, castling and rights loss, en passant and discovered checks, four promotions, checkmate/stalemate, casual draws, conquest, elimination, first-checkmate termination, estimates, and ranking.
- Fake-clock tests cover scheduling, stale callbacks, nested modal suspension, stepping, controller changes, speed, navigation, and human/spectator Undo.
- Persistence tests cover schema validation, round trips, results, undo after restoration, interrupted promotion, unavailable storage, corruption, and unsupported versions.
- DOM tests cover setup, focus-preserving rankings, reset cancellation, settings, Guide return paths, results, promotion, mobile tabs, and the skip link.
- Production build succeeds. Scripts, styles, fonts, SVG icons, font licenses, and the legacy redirect are local assets. Runtime CDN references are absent.

## Browser checks

- Desktop at 1440 × 1000: introduction, all five setup variants, and all five arena variants.
- Phone at 375 × 812 and narrow viewport at 320 × 740: board-first layout, tabs, controls, and no document horizontal overflow.
- Keyboard play completed Fool's Mate; Crimson won at ply four, the results dialog showed Checkmate, and its estimate became 100%.
- Verified Hint, coordinates, move-history collapse, AI takeover, stepping, speed changes, human-decision Undo, spectator Undo, settings, reset confirmation/cancellation, Guide examples, save recovery after reload, and Rematch.
- A restored match retained its position and stayed paused. Browser console inspection reported no warnings or errors.
- Visible buttons, selects, and navigation links measured at least 44 px tall at phone width. Native dialogs provide focus trapping and Escape; browser zoom is enabled. Reduced-motion CSS removes transitions.

## Design delivery gate

| Gate | Result and evidence |
|---|---|
| Hard gate | PASS: real routes/controls, explicit empty/error states, keyboard board moves, native dialogs, zoom enabled, mobile reflow checked, no invented figures/testimonials or runtime external assets. |
| Purpose | PASS: serif headings evoke the chosen chess club direction; ivory/walnut establish the board/table; army colors identify ownership; brass identifies primary actions. No glass, glow, or perpetual animation. |
| Liveliness | PASS: ENERGY 1 / RHYTHM 2 / MOTION 1; the radial board is the focal point and repeated motif; introductory composition differs from setup, arena, and illustrated guide. |
| Craftsmanship | PASS: unit/DOM tests and production browser checks verify behavior, recovery, controls, focus, and responsive states. Percentages remain explicitly labeled heuristic estimates. |

Contrast checks: primary text on ivory 13.98:1; muted text on parchment 6.54:1; white text on brass 6.98:1; walnut on ivory 6.51:1; board coordinates on the darkest tile 5.91:1. Grid boundaries achieve 3.64:1 against the darkest tile. All six estimate bar colors exceed 6:1 against their track.

Screenshots: [Introduction](screenshots/home-desktop.jpg), [desktop arena](screenshots/arena-desktop.jpg), [phone arena](screenshots/arena-mobile.jpg).

## Intentional limits

Win estimates are uncalibrated and do not forecast draws. Draw adjudication is simplified and does not detect every dead position. AI remains heuristic and runs on the main thread. Saves remain local to one browser origin, with 35 undo snapshots; invalid saves are preserved and saving stays disabled for that session. Human players share a device. Replay, remote multiplayer, deeper AI, and board rotation/zoom are deferred.
