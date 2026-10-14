import { BoardTopology } from './topology.js';
import { MASTER_PLAYERS, PIECE_VALUES } from './players.js';
import { pseudoMoves, legalMoves, allLegalMoves, kingInCheck, simulate, attackTargets, updateClassicMetadata, positionKey, insufficientMaterial } from './rules.js';
import { chooseBestMove } from './ai.js';
import { estimateWinChances } from './estimates.js';

export class Game {
    constructor(options = {}) {
        this.clock = options.clock || { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: id => clearTimeout(id) };
        this.onChange = options.onChange || (() => {});
        this.onEvent = options.onEvent || (() => {});
        this.numPlayers = options.numPlayers || 3;
        this.seatsIsAI = options.seatsIsAI ? [...options.seatsIsAI] : [false, true, true, true, true, true];
        this.difficulty = options.difficulty || 'tactical';
        this.victoryMode = options.victoryMode || 'last_standing';
        this.convertOnKingKill = options.convertOnKingKill ?? true;
        this.autoQueen = options.autoQueen || 'ask';
        this.aiDelay = options.aiDelay || 420;
        this.showCoords = true;
        this.isPaused = true;
        this.inArena = false;
        this.suspensions = new Set();
        this.revision = 0;
        this.aiTimer = null;
        this.newGame();
    }

    get gameOver() { return this.result.type !== 'ongoing'; }
    get winnerId() { return this.result.type === 'win' ? this.result.winner : null; }
    get spectatorMode() { return this.seatsIsAI.slice(0, this.numPlayers).every(Boolean); }
    getActivePlayer(id) { return { ...MASTER_PLAYERS[id], isAI: this.seatsIsAI[id] }; }
    isConquestActive() { return this.numPlayers >= 3 && this.convertOnKingKill; }
    getPseudoMovesForCell(cell, board = this.board) { return pseudoMoves(this, cell, board); }
    getLegalMovesForCell(cell, board = this.board) { return legalMoves(this, cell, board); }
    getAllLegalMovesForPlayer(owner, board = this.board) { return allLegalMoves(this, owner, board); }
    isKingInCheck(owner, board = this.board) { return kingInCheck(this, owner, board); }
    simulateMove(move, board = this.board) { return simulate(this, move, board); }
    estimateWinChances() { return this.result.type === 'draw' ? new Array(this.numPlayers).fill(0) : estimateWinChances(this); }
    getMaterialScore(owner) { return [...this.board.values()].reduce((sum, p) => sum + (p.owner === owner && !p.frozen && p.type !== 'K' ? PIECE_VALUES[p.type] : 0), 0); }
    emit() { this.onChange(this); }
    event(text) { this.onEvent(text); }

    cancelAI() {
        this.revision++;
        if (this.aiTimer !== null) this.clock.clearTimeout(this.aiTimer);
        this.aiTimer = null;
    }

    scheduleNextTurnIfNeeded() {
        this.cancelAI();
        if (!this.inArena || this.gameOver || this.isPaused || this.suspensions.size || !this.seatsIsAI[this.turn] || this.pendingPromotion) return;
        const revision = this.revision, turn = this.turn;
        this.aiTimer = this.clock.setTimeout(() => {
            if (revision !== this.revision) return;
            this.aiTimer = null;
            if (this.inArena && !this.gameOver && !this.isPaused && !this.suspensions.size && this.turn === turn) this.performAIMove(turn);
        }, this.aiDelay);
    }

    newGame() {
        this.cancelAI();
        this.topology = new BoardTopology(this.numPlayers);
        this.board = new Map();
        this.turn = 0; this.plyCount = 0;
        this.eliminated = new Array(this.numPlayers).fill(false);
        this.captures = Array.from({ length: this.numPlayers }, () => []);
        this.lastMoves = new Array(this.numPlayers).fill(null);
        this.selectedCell = null; this.legalMoves = []; this.hintMove = null; this.pendingPromotion = null;
        this.result = { type: 'ongoing' };
        this.history = []; this.moveLogs = [];
        this.castlingRights = [{ K: true, Q: true }, { K: true, Q: true }];
        this.enPassant = null; this.halfMoveCount = 0; this.repetitions = new Map();
        const backRank = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];
        for (let owner = 0; owner < this.numPlayers; owner++) {
            const rank = this.numPlayers === 2 && owner === 1 ? [...backRank].reverse() : backRank;
            for (let f = 0; f < 8; f++) {
                this.board.set(this.topology.key(owner, 0, f), { type: rank[f], owner, moved: false, frozen: false });
                this.board.set(this.topology.key(owner, 1, f), { type: 'P', owner, moved: false, frozen: false });
            }
        }
        if (this.numPlayers === 2) this.repetitions.set(positionKey(this), 1);
        this.emit(); this.scheduleNextTurnIfNeeded();
    }

    setPlayerCount(n) {
        if (!Number.isInteger(n) || n < 2 || n > 6) return;
        this.numPlayers = n; this.newGame();
    }
    enterArena() { this.inArena = true; this.isPaused = true; this.cancelAI(); this.emit(); }
    leaveArena() { this.inArena = false; this.isPaused = true; this.cancelAI(); this.emit(); }
    suspend(id) { this.suspensions.add(id); this.cancelAI(); this.emit(); }
    unsuspend(id) { this.suspensions.delete(id); this.emit(); this.scheduleNextTurnIfNeeded(); }
    togglePause() { this.isPaused = !this.isPaused; this.emit(); this.scheduleNextTurnIfNeeded(); }
    setSpeed(ms) {
        const value = Number(ms);
        if (![120, 420, 900].includes(value)) return;
        this.aiDelay = value; this.emit(); this.scheduleNextTurnIfNeeded();
    }
    toggleSeatController(id) {
        this.cancelAI(); this.seatsIsAI[id] = !this.seatsIsAI[id];
        this.clearSelection(); this.emit(); this.scheduleNextTurnIfNeeded();
    }
    toggleSpectatorMode() {
        const next = !this.spectatorMode;
        this.seatsIsAI = [!next ? false : true, true, true, true, true, true];
        this.clearSelection(); this.emit(); this.scheduleNextTurnIfNeeded();
    }
    stepAI() {
        if (!this.inArena || this.gameOver || this.suspensions.size || !this.seatsIsAI[this.turn]) return;
        this.cancelAI(); this.isPaused = true; this.performAIMove(this.turn);
    }
    performAIMove(owner) {
        if (this.gameOver || this.turn !== owner || this.suspensions.size) return;
        const move = chooseBestMove(this, owner);
        if (move) this.executeMove({ ...move, promoteTo: 'Q' }, { human: false });
    }
    clearSelection() { this.selectedCell = null; this.legalMoves = []; this.hintMove = null; }
    selectCell(cell) {
        if (!cell || this.gameOver || this.seatsIsAI[this.turn] || this.suspensions.size || this.pendingPromotion) return;
        const move = this.legalMoves.find(m => m.to.key === cell.key);
        if (this.selectedCell && move) {
            if (move.promotion && this.autoQueen === 'ask') { this.pendingPromotion = move; this.cancelAI(); this.emit(); return; }
            this.executeMove({ ...move, promoteTo: 'Q' }, { human: true }); return;
        }
        const piece = this.board.get(cell.key);
        this.clearSelection();
        if (piece?.owner === this.turn && !piece.frozen) { this.selectedCell = cell; this.legalMoves = this.getLegalMovesForCell(cell); }
        this.emit();
    }
    completePromotion(type) {
        if (!this.pendingPromotion || !['Q', 'R', 'B', 'N'].includes(type)) return;
        const move = this.pendingPromotion; this.pendingPromotion = null;
        this.executeMove({ ...move, promoteTo: type }, { human: true });
    }
    showHint() {
        if (this.gameOver || this.seatsIsAI[this.turn]) return;
        const move = chooseBestMove(this, this.turn);
        if (move) { this.selectedCell = move.from; this.legalMoves = this.getLegalMovesForCell(move.from); this.hintMove = move; this.event(`Hint: ${move.from.coord} to ${move.to.coord}`); this.emit(); }
    }

    snapshot() {
        return {
            board: [...this.board].map(([key, piece]) => [key, { ...piece }]), turn: this.turn, plyCount: this.plyCount,
            eliminated: [...this.eliminated], captures: this.captures.map(c => [...c]),
            lastMoves: this.lastMoves.map(m => m ? { from: m.from.key, to: m.to.key } : null),
            moveLogs: this.moveLogs.map(m => ({ ...m })), result: { ...this.result },
            castlingRights: this.castlingRights.map(r => ({ ...r })), enPassant: this.enPassant ? { ...this.enPassant } : null,
            halfMoveCount: this.halfMoveCount, repetitions: [...this.repetitions],
        };
    }
    restoreState(snapshot) {
        this.cancelAI();
        this.board = new Map(snapshot.board.map(([key, piece]) => [key, { ...piece }]));
        for (const key of ['turn', 'plyCount', 'halfMoveCount']) this[key] = snapshot[key];
        this.eliminated = [...snapshot.eliminated]; this.captures = snapshot.captures.map(c => [...c]);
        this.lastMoves = snapshot.lastMoves.map(m => m ? { from: this.topology.cellMap.get(m.from), to: this.topology.cellMap.get(m.to) } : null);
        this.moveLogs = snapshot.moveLogs.map(m => ({ ...m })); this.result = { ...snapshot.result };
        this.castlingRights = snapshot.castlingRights.map(r => ({ ...r }));
        this.enPassant = snapshot.enPassant ? { ...snapshot.enPassant } : null;
        this.repetitions = new Map(snapshot.repetitions);
        this.pendingPromotion = null; this.clearSelection();
    }
    canUndo() { return this.spectatorMode ? this.history.length > 0 : this.history.some(h => h.human); }
    undoMove() {
        if (!this.canUndo()) return;
        const wasRunning = !this.isPaused;
        const index = this.spectatorMode ? this.history.length - 1 : this.history.findLastIndex(h => h.human);
        const entry = this.history[index];
        this.history.splice(index); this.restoreState(entry.state);
        this.isPaused = this.spectatorMode || !wasRunning;
        this.event('Move undone.'); this.emit(); this.scheduleNextTurnIfNeeded();
    }

    executeMove(request, { human = !this.seatsIsAI[this.turn] } = {}) {
        if (this.gameOver) return false;
        const legal = this.getAllLegalMovesForPlayer(this.turn).find(m => m.from.key === request.from?.key && m.to.key === request.to?.key);
        if (!legal) return false;
        const move = { ...legal, promoteTo: ['Q', 'R', 'B', 'N'].includes(request.promoteTo) ? request.promoteTo : 'Q' };
        this.cancelAI();
        this.history.push({ human, state: this.snapshot() });
        if (this.history.length > 35) this.history.shift();
        const piece = this.board.get(move.from.key), captured = this.board.get(move.enPassant || move.to.key);
        if (captured) this.captures[piece.owner].push(captured.type);
        if (this.numPlayers === 2) updateClassicMetadata(this, move, piece, captured);
        this.board = this.simulateMove(move); this.lastMoves[piece.owner] = { from: move.from, to: move.to };
        this.clearSelection(); this.plyCount++;
        const text = move.castle ? (move.castle === 'K' ? 'O-O' : 'O-O-O') : `${piece.type}${move.from.coord}${captured ? '×' : '–'}${move.to.coord}${move.promotion ? '=' + move.promoteTo : ''}`;
        this.moveLogs.unshift({ ply: this.plyCount, player: piece.owner, text, human });
        this.moveLogs = this.moveLogs.slice(0, 200);
        if (captured?.type === 'K' && this.numPlayers > 2) this.handlePlayerElimination(captured.owner, true, piece.owner, true);
        if (!this.gameOver) this.advanceTurn();
        this.moveLogs = this.moveLogs.slice(0,200);
        this.emit(); this.scheduleNextTurnIfNeeded();
        return true;
    }

    advanceTurn() {
        if (this.gameOver) return;
        if (this.numPlayers === 2) {
            this.turn = 1 - this.turn;
            const moves = this.getAllLegalMovesForPlayer(this.turn), check = this.isKingInCheck(this.turn);
            if (!moves.length) { this.finish(check ? { type: 'win', winner: 1 - this.turn, reason: 'Checkmate' } : { type: 'draw', reason: 'Stalemate' }); return; }
            const key = positionKey(this); this.repetitions.set(key, (this.repetitions.get(key) || 0) + 1);
            if (this.repetitions.get(key) >= 3) this.finish({ type: 'draw', reason: 'Threefold repetition' });
            else if (this.halfMoveCount >= 100) this.finish({ type: 'draw', reason: '50-move rule' });
            else if (insufficientMaterial(this)) this.finish({ type: 'draw', reason: 'Insufficient material' });
            else if (check) this.event(`${MASTER_PLAYERS[this.turn].name} is in check.`);
            return;
        }
        const mover = this.turn;
        for (let i = 1; i <= this.numPlayers; i++) {
            const next = (mover + i) % this.numPlayers;
            if (this.eliminated[next]) continue;
            const hasKing = [...this.board.values()].some(p => p.owner === next && p.type === 'K' && !p.frozen);
            if (!hasKing) this.handlePlayerElimination(next, true, mover, true);
            else {
                const moves = this.getAllLegalMovesForPlayer(next), check = this.isKingInCheck(next);
                if (!moves.length) this.handlePlayerElimination(next, check, check ? this.findKingAttacker(next, mover) : null);
                else { this.turn = next; if (check) this.event(`${MASTER_PLAYERS[next].name} is in check.`); break; }
            }
            if (this.gameOver) return;
        }
        const alive = this.eliminated.map((e, p) => e ? null : p).filter(p => p !== null);
        if (alive.length === 1) this.finish({ type: 'win', winner: alive[0], reason: 'Last king standing' });
        else if (!alive.length) this.finish({ type: 'draw', reason: 'No armies remain' });
    }

    findKingAttacker(victim, preferred) {
        const king = [...this.board].find(([, p]) => p.owner === victim && p.type === 'K' && !p.frozen)?.[0];
        const attackers = [...this.board].filter(([key, p]) => p.owner !== victim && !p.frozen && attackTargets(this, this.topology.cellMap.get(key)).includes(king));
        return attackers.find(([, p]) => p.owner === preferred)?.[1].owner ?? attackers[0]?.[1].owner ?? preferred;
    }
    handlePlayerElimination(victim, checkmated, killer = null, direct = false) {
        if (this.eliminated[victim]) return;
        this.eliminated[victim] = true;
        const reason = direct ? 'King captured' : checkmated ? 'Checkmated' : 'Stalemated';
        let text = `${MASTER_PLAYERS[victim].name}: ${reason}`;
        if (this.victoryMode === 'first_checkmate' && checkmated) {
            this.moveLogs.unshift({ ply: this.plyCount, player: killer ?? this.turn, text });
            this.finish({ type: 'win', winner: killer ?? this.turn, reason: `First checkmate: ${MASTER_PLAYERS[victim].name}` }); return;
        }
        if (this.isConquestActive() && checkmated && killer !== null && killer !== victim) {
            let converted = 0;
            for (const [key, piece] of this.board) {
                if (piece.owner !== victim) continue;
                if (piece.type === 'K') this.board.delete(key);
                else { piece.owner = killer; piece.frozen = false; converted++; }
            }
            text = `${MASTER_PLAYERS[killer].name} conquered ${MASTER_PLAYERS[victim].name} (+${converted} pieces)`;
        } else {
            for (const [key, piece] of this.board) {
                if (piece.owner !== victim) continue;
                if (this.victoryMode === 'remove_eliminated') this.board.delete(key);
                else piece.frozen = true;
            }
        }
        this.moveLogs.unshift({ ply: this.plyCount, player: killer ?? victim, text }); this.event(text);
    }
    finish(result) { this.result = result; this.cancelAI(); this.event(result.type === 'win' ? `${MASTER_PLAYERS[result.winner].name} wins. ${result.reason}.` : `Draw. ${result.reason}.`); }
    triggerGameOver(winner, reason = 'Last king standing') { this.finish({ type: 'win', winner, reason }); this.emit(); }
}
