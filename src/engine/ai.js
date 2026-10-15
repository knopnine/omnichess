import { PIECE_VALUES } from './players.js';
import { attackTargets } from './rules.js';
import { crossPawnProgress } from './cross.js';
import { referenceProgress } from './surfaces.js';

export function chooseBestMove(game, owner) {
    const moves = game.getAllLegalMovesForPlayer(owner);
    let best = null, bestScore = -Infinity;
    for (const move of moves) {
        const mover = game.board.get(move.from.key);
        const target = game.board.get(move.enPassant || move.to.key);
        let score = target ? PIECE_VALUES[target.type] * 12 - PIECE_VALUES[mover.type] * 0.8 : 0;
        if (target?.type === 'K') score += 1000;
        if (move.promotion) score += 80;
        score += game.boardStyle==='cross' && move.to.s===4 ? 1.8 : move.to.r === 3 ? 1.8 : move.to.r === 2 ? 1 : 0;
        if (mover.type === 'P') score += (game.boardStyle==='mobius'?referenceProgress(move.to,mover):game.boardStyle==='cross' ? crossPawnProgress(move.to,owner) : move.to.s === owner ? move.to.r : game.topology.ranks*2-1 - move.to.r) * 0.65;
        if (move.castle) score += 4.5;
        if (game.difficulty === 'tactical') {
            const next = game.simulateMove(move);
            for (let opp = 0; opp < game.numPlayers; opp++) {
                if (opp === owner || game.eliminated[opp]) continue;
                if (game.isKingInCheck(opp, next)) {
                    score += game.isConquestActive() ? 10 : 6;
                    if (!game.getAllLegalMovesForPlayer(opp, next).length) score += game.isConquestActive() ? 800 : 500;
                }
            }
            if ([...next].some(([key, p]) => p.owner !== owner && !p.frozen && attackTargets(game, game.topology.cellMap.get(key), next).includes(move.to.key))) score -= PIECE_VALUES[mover.type] * 7.5;
        }
        score += (Math.random() - 0.5) * 1.25;
        if (score > bestScore) { bestScore = score; best = move; }
    }
    return best;
}
