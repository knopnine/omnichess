import { PIECE_VALUES } from './players.js';
import { attackTargets } from './rules.js';
import { crossPawnProgress } from './cross.js';
import { referenceProgress } from './surfaces.js';
export function estimateWinChances(game) {
                const chances = new Array(game.numPlayers).fill(0);
                if (game.gameOver && game.winnerId !== null) {
                    chances[game.winnerId] = 100;
                    return chances;
                }

                const active = [];
                const attacks = Array.from({ length: game.numPlayers }, () => new Set());
                const scores = new Array(game.numPlayers).fill(0);
                for (let p = 0; p < game.numPlayers; p++) {
                    if (!game.eliminated[p]) active.push(p);
                }
                if (active.length === 0) return chances;
                if (active.length === 1) {
                    chances[active[0]] = 100;
                    return chances;
                }

                for (const [key, piece] of game.board) {
                    if (piece.frozen || game.eliminated[piece.owner]) continue;
                    const cell = game.topology.cellMap.get(key);
                    if (!cell) continue;
                    const owner = piece.owner;
                    const moves = game.getPseudoMovesForCell(cell, game.board);
                    scores[owner] += piece.type === 'K' ? 0 : PIECE_VALUES[piece.type];
                    scores[owner] += new Set(moves.map(m => m.to.key)).size * 0.035;
                    if (piece.type !== 'K') scores[owner] += (game.boardStyle==='mobius'?referenceProgress(cell,piece):game.boardStyle==='cross' && cell.s===4 ? 4 : cell.r) * 0.1;
                    if (piece.type === 'P') {
                        const progress = game.boardStyle==='mobius'?referenceProgress(cell,piece):game.boardStyle==='cross' ? crossPawnProgress(cell,owner) : cell.s === owner ? cell.r : game.topology.ranks*2-1 - cell.r;
                        scores[owner] += Math.max(0, progress - 1) * 0.12;
                    }
                    for (const target of attackTargets(game, cell)) attacks[owner].add(target);
                }

                for (const [key, piece] of game.board) {
                    if (piece.frozen || game.eliminated[piece.owner]) continue;
                    if (active.some(p => p !== piece.owner && attacks[p].has(key))) {
                        scores[piece.owner] -= piece.type === 'K' ? 3 : PIECE_VALUES[piece.type] * 0.2;
                    }
                }

                // Softmax produces relative shares. A small equal-share component
                // reserves uncertainty until the game declares a winner.
                const maxScore = Math.max(...active.map(p => scores[p]));
                const weights = active.map(p => Math.exp((scores[p] - maxScore) / 12));
                const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
                const shares = active.map((p, i) => {
                    const tenths = (0.99 * weights[i] / totalWeight + 0.01 / active.length) * 1000;
                    return { player: p, tenths: Math.floor(tenths), remainder: tenths - Math.floor(tenths) };
                });
                // Largest remainders keep the displayed one-decimal values at 100%.
                const missing = 1000 - shares.reduce((sum, share) => sum + share.tenths, 0);
                shares.sort((a, b) => b.remainder - a.remainder || a.player - b.player);
                for (let i = 0; i < missing; i++) shares[i].tenths++;
                for (const share of shares) chances[share.player] = share.tenths / 10;
                return chances;
            }
