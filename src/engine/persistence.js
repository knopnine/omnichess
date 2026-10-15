import { BoardTopology, BOARD_STYLES } from './topology.js';

export const SAVE_KEY = 'omnichess.match';
export const SAVE_VERSION = 1;
const integer = (n, max) => Number.isInteger(n) && n >= 0 && n <= max;
const bools = (value, length) => Array.isArray(value) && value.length === length && value.every(v => typeof v === 'boolean');
const types = ['P', 'N', 'B', 'R', 'Q', 'K'];
const savedStyle=o=>o.boardStyle==='mobius' && o.mobiusVersion===undefined?'mobius-8x8':o.boardStyle;

function validState(state, n, keys) {
    if (!state || !Array.isArray(state.board) || state.board.length > keys.size || !integer(state.turn, n - 1) || !integer(state.plyCount, 1e7) || !integer(state.halfMoveCount, 1e7)) return false;
    const seen = new Set();
    for (const entry of state.board) {
        if (!Array.isArray(entry) || entry.length !== 2) return false;
        const [key, p] = entry;
        if(p?.pawnTwisted!==undefined && typeof p.pawnTwisted!=='boolean')return false;
        if(p?.pawnDirection!==undefined && ![-1,1].includes(p.pawnDirection))return false;
        if (!keys.has(key) || seen.has(key) || !p || !types.includes(p.type) || !integer(p.owner, n - 1) || typeof p.moved !== 'boolean' || typeof p.frozen !== 'boolean') return false;
        seen.add(key);
    }
    if (!bools(state.eliminated, n)) return false;
    if (!Array.isArray(state.captures) || state.captures.length !== n || !state.captures.every(c => Array.isArray(c) && c.length <= 1e4 && c.every(t => types.includes(t)))) return false;
    if (!Array.isArray(state.lastMoves) || state.lastMoves.length !== n || !state.lastMoves.every(m => m === null || (keys.has(m.from) && keys.has(m.to)))) return false;
    if (!Array.isArray(state.moveLogs) || state.moveLogs.length > 200 || !state.moveLogs.every(m => integer(m.ply, state.plyCount) && integer(m.player, n - 1) && typeof m.text === 'string' && m.text.length < 500 && (m.human === undefined || typeof m.human === 'boolean'))) return false;
    if (!Array.isArray(state.castlingRights) || state.castlingRights.length !== 2 || !state.castlingRights.every(r => r && typeof r.K === 'boolean' && typeof r.Q === 'boolean')) return false;
    if (state.enPassant !== null && (!state.enPassant || n !== 2 || !keys.has(state.enPassant.target) || !keys.has(state.enPassant.pawn) || !integer(state.enPassant.owner, 1))) return false;
    if (!Array.isArray(state.repetitions) || state.repetitions.length > 1e4 || !state.repetitions.every(e => Array.isArray(e) && e.length === 2 && typeof e[0] === 'string' && e[0].length < 5000 && integer(e[1], 1e7) && e[1] > 0)) return false;
    if (!state.result || !['ongoing', 'win', 'draw'].includes(state.result.type)) return false;
    if (state.result.type !== 'ongoing' && (typeof state.result.reason !== 'string' || state.result.reason.length > 500)) return false;
    if (state.result.type === 'win' && !integer(state.result.winner, n - 1)) return false;
    for (let owner = 0; owner < n; owner++) {
        const kings = state.board.filter(([, p]) => p.owner === owner && p.type === 'K' && !p.frozen).length;
        if (!state.eliminated[owner] && kings !== 1) return false;
    }
    return true;
}

export function validateSave(data) {
    if (!data || data.version !== SAVE_VERSION || typeof data.savedAt !== 'string') return false;
    const o = data.options, n = o?.numPlayers;
    if (!Number.isInteger(n) || n < 2 || n > 6 || !bools(o.seatsIsAI, 6)) return false;
    if (!['casual', 'tactical'].includes(o.difficulty) || !['last_standing', 'remove_eliminated', 'first_checkmate'].includes(o.victoryMode) || !['ask', 'auto'].includes(o.autoQueen) || typeof o.convertOnKingKill !== 'boolean' || typeof o.showCoords !== 'boolean' || ![120, 420, 900].includes(o.aiDelay)) return false;
    if(o.boardStyle !== undefined && (!Object.hasOwn(BOARD_STYLES,o.boardStyle) || (BOARD_STYLES[o.boardStyle].players!==null && BOARD_STYLES[o.boardStyle].players!==n))) return false;
    if(o.mobiusVersion!==undefined && (o.boardStyle!=='mobius' || o.mobiusVersion!==2))return false;
    const keys = new Set(new BoardTopology(n,savedStyle(o)).cellMap.keys());
    if(o.boardStyle==='mobius' && o.mobiusVersion===2 && [data.state,...(Array.isArray(data.history)?data.history.map(h=>h?.state):[])].some(state=>!Array.isArray(state?.board) || !state.board.every(entry=>entry?.[1]?.type!=='P' || [-1,1].includes(entry[1].pawnDirection))))return false;
    if (!validState(data.state, n, keys) || !Array.isArray(data.history) || data.history.length > 35) return false;
    return data.history.every(h => h && typeof h.human === 'boolean' && validState(h.state, n, keys) && h.state.plyCount < data.state.plyCount);
}

export function serializeGame(game) {
    return {
        version: SAVE_VERSION, savedAt: new Date().toISOString(),
        options: {...Object.fromEntries(['numPlayers', 'boardStyle', 'seatsIsAI', 'difficulty', 'victoryMode', 'convertOnKingKill', 'autoQueen', 'aiDelay', 'showCoords'].map(k => [k, game[k]])),...(game.boardStyle==='mobius'?{mobiusVersion:2}:{})},
        state: game.snapshot(), history: game.history,
    };
}

export function restoreGame(game, data) {
    if (!validateSave(data)) throw new Error('Invalid or unsupported save');
    game.cancelAI(); Object.assign(game, data.options); game.seatsIsAI = [...data.options.seatsIsAI];
    game.boardStyle = savedStyle(data.options) || 'radial';
    game.topology = new BoardTopology(game.numPlayers,game.boardStyle);
    game.restoreState(data.state); game.history = structuredClone(data.history);
    game.isPaused = true; game.inArena = false; game.suspensions.clear();
    game.emit();
}

export class Persistence {
    constructor(storage, onWarning = () => {}) { this.storage = storage; this.onWarning = onWarning; this.blocked = false; this.warned = false; }
    warn(message) { if (!this.warned) { this.onWarning(message); this.warned = true; } }
    read() {
        try {
            const raw = this.storage.getItem(SAVE_KEY);
            if (raw === null) return null;
            const data = JSON.parse(raw);
            if (!validateSave(data)) throw new Error('Invalid save');
            return data;
        } catch {
            this.blocked = true;
            this.warn('The saved match cannot be read. It has been left untouched. You can still play without saving.');
            return null;
        }
    }
    save(game) {
        if (this.blocked) return false;
        try { this.storage.setItem(SAVE_KEY, JSON.stringify(serializeGame(game))); return true; }
        catch { this.warn('Local saving is unavailable. This match will continue, but may be lost on refresh.'); return false; }
    }
}
