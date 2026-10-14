import { multiplayerRules } from './multiplayer.js';

export const globalSquare = cell => ({ x: cell.s === 0 ? cell.f : 7 - cell.f, y: cell.s === 0 ? cell.r : 7 - cell.r });
export function squareCell(topology, x, y) {
    if (x < 0 || x > 7 || y < 0 || y > 7) return null;
    return y < 4 ? topology.getCell(0, y, x) : topology.getCell(1, 7 - y, 7 - x);
}

const orthogonal = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const diagonal = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

function classicMoves(game, from, board, attacks = false) {
    const piece = board.get(from.key);
    if (!piece || piece.frozen) return [];
    const { x, y } = globalSquare(from);
    const moves = [];
    const land = (tx, ty, extra = {}) => {
        const to = squareCell(game.topology, tx, ty);
        if (!to) return false;
        const target = board.get(to.key);
        if (attacks || !target || (target.owner !== piece.owner && target.type !== 'K')) {
            moves.push({ from, to, capture: !!target, ...extra });
        }
        return !target;
    };
    if (piece.type === 'P') {
        const dy = piece.owner === 0 ? 1 : -1;
        const lastRank = piece.owner === 0 ? 7 : 0;
        if (attacks) {
            for (const dx of [-1, 1]) land(x + dx, y + dy);
            return moves;
        }
        const ahead = squareCell(game.topology, x, y + dy);
        if (ahead && !board.has(ahead.key)) {
            land(x, y + dy, { promotion: y + dy === lastRank });
            const two = squareCell(game.topology, x, y + 2 * dy);
            if (y === (piece.owner === 0 ? 1 : 6) && two && !board.has(two.key)) land(x, y + 2 * dy, { doublePawn: true });
        }
        for (const dx of [-1, 1]) {
            const to = squareCell(game.topology, x + dx, y + dy);
            if (!to) continue;
            const target = board.get(to.key);
            if (target && target.owner !== piece.owner && target.type !== 'K') land(x + dx, y + dy, { promotion: y + dy === lastRank });
            const ep = game.enPassant;
            const captured = ep && board.get(ep.pawn);
            if (!target && ep?.target === to.key && ep.owner !== piece.owner && captured?.type === 'P' && captured.owner === ep.owner) {
                moves.push({ from, to, capture: true, enPassant: ep.pawn });
            }
        }
    } else if (piece.type === 'N') {
        for (const [dx, dy] of [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]]) land(x + dx, y + dy);
    } else if (piece.type === 'K') {
        for (const [dx, dy] of [...orthogonal, ...diagonal]) land(x + dx, y + dy);
        if (!attacks && x === 4 && y === (piece.owner === 0 ? 0 : 7)) {
            for (const side of ['K', 'Q']) {
                if (!game.castlingRights[piece.owner][side]) continue;
                const rookCell = squareCell(game.topology, side === 'K' ? 7 : 0, y);
                const rook = board.get(rookCell.key);
                const files = side === 'K' ? [5, 6] : [1, 2, 3];
                if (rook?.type === 'R' && rook.owner === piece.owner && files.every(f => !board.has(squareCell(game.topology, f, y).key))) {
                    land(side === 'K' ? 6 : 2, y, { castle: side, rookFrom: rookCell.key, rookTo: squareCell(game.topology, side === 'K' ? 5 : 3, y).key });
                }
            }
        }
    } else {
        const dirs = piece.type === 'R' ? orthogonal : piece.type === 'B' ? diagonal : [...orthogonal, ...diagonal];
        for (const [dx, dy] of dirs) {
            for (let i = 1; i <= 7; i++) {
                if (!squareCell(game.topology, x + dx * i, y + dy * i)) break;
                if (!land(x + dx * i, y + dy * i)) break;
            }
        }
    }
    return moves;
}

export function pseudoMoves(game, cell, board = game.board) {
    if (game.numPlayers === 2) return classicMoves(game, cell, board);
    return multiplayerRules.multiPseudo.call(game, cell, board);
}

export function attackTargets(game, cell, board = game.board) {
    const piece = board.get(cell.key);
    if (!piece || piece.frozen) return [];
    if (game.numPlayers === 2) return classicMoves(game, cell, board, true).map(m => m.to.key);
    if (piece.type === 'P') {
        const dr = cell.s === piece.owner ? 1 : -1;
        return [-1, 1].flatMap(df => game.topology.stepDiagonal(cell.s, cell.r, cell.f, dr, df).map(t => game.topology.key(t.s, t.r, t.f)));
    }
    return pseudoMoves(game, cell, board).filter(m => !m.castle).map(m => m.to.key);
}

export function attacked(game, key, owner, board = game.board) {
    for (const [from, piece] of board) {
        if (piece.owner !== owner && !piece.frozen && attackTargets(game, game.topology.cellMap.get(from), board).includes(key)) return true;
    }
    return false;
}

export function kingInCheck(game, owner, board = game.board) {
    for (const [key, piece] of board) {
        if (piece.owner === owner && piece.type === 'K' && !piece.frozen) return attacked(game, key, owner, board);
    }
    return false;
}

export function simulate(game, move, board = game.board) {
    const next = new Map([...board].map(([key, piece]) => [key, { ...piece }]));
    const moving = next.get(move.from.key);
    if (!moving) throw new Error('Move has no piece');
    next.delete(move.from.key);
    if (move.enPassant) next.delete(move.enPassant);
    next.set(move.to.key, { ...moving, moved: true, type: move.promotion ? move.promoteTo || 'Q' : moving.type });
    if (move.castle) {
        const rookFrom = move.rookFrom || game.topology.key(move.from.s, 0, move.castle === 'K' ? 7 : 0);
        const rookTo = move.rookTo || game.topology.key(move.from.s, 0, move.castle === 'K' ? 5 : 3);
        next.set(rookTo, { ...next.get(rookFrom), moved: true });
        next.delete(rookFrom);
    }
    return next;
}

export function legalMoves(game, cell, board = game.board) {
    const piece = cell && board.get(cell.key);
    if (!piece || piece.frozen) return [];
    return pseudoMoves(game, cell, board).filter(move => {
        if (move.castle) {
            if (kingInCheck(game, piece.owner, board)) return false;
            const pass = game.numPlayers === 2
                ? squareCell(game.topology, move.castle === 'K' ? 5 : 3, globalSquare(cell).y)
                : game.topology.getCell(cell.s, 0, move.castle === 'K' ? 5 : 3);
            if (kingInCheck(game, piece.owner, simulate(game, { from: cell, to: pass }, board))) return false;
        }
        return !kingInCheck(game, piece.owner, simulate(game, move, board));
    });
}

export function allLegalMoves(game, owner, board = game.board) {
    return [...board].filter(([, p]) => p.owner === owner && !p.frozen)
        .flatMap(([key]) => legalMoves(game, game.topology.cellMap.get(key), board));
}

export function updateClassicMetadata(game, move, piece, captured) {
    const from = globalSquare(move.from), to = globalSquare(move.to);
    if (piece.type === 'K') game.castlingRights[piece.owner] = { K: false, Q: false };
    if (piece.type === 'R' && from.y === (piece.owner === 0 ? 0 : 7)) {
        if (from.x === 0) game.castlingRights[piece.owner].Q = false;
        if (from.x === 7) game.castlingRights[piece.owner].K = false;
    }
    if (captured?.type === 'R' && to.y === (captured.owner === 0 ? 0 : 7)) {
        if (to.x === 0) game.castlingRights[captured.owner].Q = false;
        if (to.x === 7) game.castlingRights[captured.owner].K = false;
    }
    game.enPassant = piece.type === 'P' && Math.abs(from.y - to.y) === 2
        ? { target: squareCell(game.topology, from.x, (from.y + to.y) / 2).key, pawn: move.to.key, owner: piece.owner } : null;
    game.halfMoveCount = piece.type === 'P' || captured ? 0 : game.halfMoveCount + 1;
    // Positions before a pawn move or capture cannot recur; pruning also bounds saves.
    if (piece.type === 'P' || captured) game.repetitions.clear();
}

export function positionKey(game) {
    const placement = [...game.board].sort(([a], [b]) => a.localeCompare(b)).map(([key, p]) => `${key}:${p.owner}${p.type}`).join('|');
    const ep = game.enPassant && allLegalMoves(game, game.turn).some(m => m.enPassant) ? game.enPassant.target : '-';
    return `${placement}/${game.turn}/${game.castlingRights.map(r => `${+r.K}${+r.Q}`).join('')}/${ep}`;
}

export function insufficientMaterial(game) {
    const pieces = [...game.board].filter(([, p]) => p.type !== 'K');
    if (!pieces.length) return true;
    if (pieces.length === 1 && ['B', 'N'].includes(pieces[0][1].type)) return true;
    if (pieces.every(([, p]) => p.type === 'B')) {
        const colors = pieces.map(([key]) => { const { x, y } = globalSquare(game.topology.cellMap.get(key)); return (x + y) % 2; });
        return colors.every(c => c === colors[0]);
    }
    return false;
}
