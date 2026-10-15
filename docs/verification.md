# Release verification

Verified on 15 October 2026 using Node.js 24 and the Vite production preview. No remote repository or deployment was created.

## Automated checks

- All 172 engine, timer, persistence, geometry, animation, and DOM tests pass.
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

## Wider rosette layout trial

Four to six players now use a regular central polygon with twice as many triangular cells as armies. The surrounding grid is redistributed around that rosette, preserving the outer outline, cell count, keys, and seam movement rules. Two- and three-player tile geometry is unchanged.

Added checks verify convex cells, positive fitted-circle radii, complete coverage, and exact shared edges at every multiplayer rank seam. Six-player minimum cell angle improves from approximately 11.9° to 18.7°; central cell area is approximately four times the previous area. These remain angled radial boards rather than square-cell layouts. Piece circles, including their borders, fit inside their tiles.

Production-browser checks cover four-, five-, and six-player layouts, a keyboard pawn move, AI stepping, and human-decision Undo. Phone-width checks show no horizontal overflow or console warnings/errors. The trial is shown in [desktop](screenshots/rosette-desktop.jpg) and [phone](screenshots/rosette-mobile.jpg) screenshots.

## Three-arm trial

The three-arm trial adds 48 playable central cells to three square-cell home arms. Tests verify silhouette coverage, 96 square arm cells, central entry and seam edge adjacency, legal central moves, estimates, save/undo round trips, legacy save compatibility, and setup restrictions. The center adapts the existing sector graph rather than duplicating the reference's diamond lattice.

Production-browser checks verified keyboard movement, animated AI replies, human undo, and refresh/resume recovery. At 390 px wide there is no horizontal overflow, and the browser reports no warnings or errors. See [desktop](screenshots/three-arm-desktop.jpg) and [phone](screenshots/three-arm-mobile.jpg).

## Four-player cross

The four-player Cross board contains 192 equal square cells, including a 64-cell hub. Tests verify absent corners, straight rook/bishop traversal, blocking and captures, knight joins, four pawn directions and promotion ranks, castling transit checks, conquest, first-checkmate termination, central-cell saving/undo, move-animation events, and setup restrictions.

Production-browser checks verified a keyboard pawn move, three animated AI replies, Undo back to the opening, and refresh/resume with Cross retained and AI paused. The 390 px phone layout has no horizontal overflow; no warnings or errors were logged. See [desktop](screenshots/cross-desktop.jpg) and [phone](screenshots/cross-mobile.jpg).

## Piece movement

### Five-arm and Six-arm

Five-arm contains 240 cells (160 square arm cells plus 80 center cells); Six-arm contains 288 (192 plus 96). Automated checks cover convexity, positive area, complete silhouette coverage, arm/center and inter-sector shared edges, center movement, animation events, estimates, save/undo round trips, invalid count/style combinations, conquest, freezing, removal and first-checkmate termination. Both join the uniform-size, non-overlap and animation-resize checks.

Production-browser checks verified a Five-arm keyboard move followed by four animated AI replies, Undo to the opening and refresh recovery; Six-arm spectator pause, one-move Step and refresh recovery; and both layouts at 390 px without horizontal overflow. See [Five-arm desktop](screenshots/five-arm-desktop.jpg), [Five-arm phone](screenshots/five-arm-mobile.jpg), [Six-arm desktop](screenshots/six-arm-desktop.jpg), and [Six-arm phone](screenshots/six-arm-mobile.jpg).

### Uniform size and fitted grids

Every board uses one shared piece size that includes ownership-ring clearance. Stationary pieces, fading victims and traveling pieces use the same size; resizing the board scales them together. Tests verify containment and pairwise non-overlap on all eleven layouts, plus constant sizes during animations and after resizing. Grid vertices are fitted offline and checked in, so there is no runtime optimization. Existing cell keys, cell counts, saved positions and rule transitions remain intact.

### Donut and earlier 8×8 Möbius experiment

These original two-player surfaces have 64 cells. Their regression tests cover safe openings (20 legal opening moves for Donut, 24 for legacy Möbius), finite deduplicated rays, file wrapping and rank reversal, cross-seam king attacks, castling transit safety, ordinary and cross-seam en passant, reversed pawn direction, underpromotion, direction-aware repetition keys, save validation/round trips/undo, conservative material draws, donut hole hit-testing, circular animation and Möbius fade transitions. The 8×8 Möbius version is now used only to restore existing saves; Setup offers the reference version below. Classic perft remains 20/400/8,902.

Production-browser checks verified a Donut keyboard pawn move, animated AI reply, Undo and refresh/resume; a Möbius AI step capturing across the seam (Rh1×a8), paused save restoration, and both layouts at 390 px without horizontal overflow. No warnings or errors were logged. Möbius intentionally uses an unfolded map, with its reversed seam labeled, rather than a 3D rendering. See [Donut desktop](screenshots/donut-desktop.jpg), [Donut phone](screenshots/donut-mobile.jpg), [Möbius desktop](screenshots/mobius-desktop.jpg), and [Möbius phone](screenshots/mobius-mobile.jpg).

### Reference-based 8×14 Möbius

The new-match option follows Alberto Monteiro’s [Möbius reference](https://www.chessvariants.com/shape.dir/x_moeb.html) and its linked cylindrical setup. It has 112 cells, 24 pieces per army, four directed pawn fronts, the file-reversing 11/12 join and ordinary 14/1 join. Added tests verify the exact setup, 40 safe opening moves, balanced initial estimates, the f1–a6–b12 bishop color change, finite looping rays, knight/king seams, both fronts’ double steps and promotion ranks, rear en passant, both armies’ castling, version-2 saves and legacy restoration. Uniform size, non-overlap and animation-resize tests also cover the new geometry.

Production-browser checks verified restoration of an actual earlier 8×8 save under its original rules; starting the new 112-cell option; keyboard navigation to e14 with a downward-direction description; e14–e12 followed by an animated AI reply from f9–f11; Undo to the opening; and paused refresh recovery. At 390 px there is no horizontal overflow and both seam labels remain visible. No warnings or errors were logged. See [reference board desktop](screenshots/mobius-reference-desktop.jpg) and [phone](screenshots/mobius-reference-mobile.jpg).

At geometry radius 300, minimum fitted cell radii improve from 7.77 to 19.40 for three-player radial, 6.34 to 17.20 for four-player radial, 5.4 to 15.61 for five-player radial, 4.61 to 13.52 for six-player radial, and 4.77 to 9.39 for three-arm. The earlier rosette trial described above has been superseded by these fitted grids. The common size is intentionally more conservative than the old largest home-piece sizes; the three-arm board remains dense at phone widths.

Production-browser checks verified the latest build, restoration of a prior six-player save, a keyboard pawn move and animated AI step, three-arm and Cross previews, no phone-width horizontal overflow, and no logged warnings or errors. See [six-player desktop](screenshots/uniform-pieces-six-player.jpg) and [phone](screenshots/uniform-pieces-mobile.jpg).

Move events contain original pieces, source/destination keys, captured pieces, and castling rook movement. A frame-driven renderer glides pieces with a short ease-out, fades captures, and reveals promoted pieces on arrival. AI is suspended until animation finishes, terminal dialogs wait for arrival, and restored/reset positions invalidate stale frames. Reduced-motion preferences bypass animation. Fake-frame tests cover interpolation, completion, cancellation, replacement, and reduced motion; engine tests cover capture, en passant, promotion, castling, and AI synchronization.

Production-browser checks verified human and AI moves on the six-player board, including phone width. The board's busy state was true during movement and false afterward, with no browser warnings/errors. [Board after animated moves](screenshots/movement-desktop.jpg).
