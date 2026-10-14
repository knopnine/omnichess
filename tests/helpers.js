import { Game } from '../src/engine/game.js';

export function fixture(players = 2, pieces = {}) {
    const game = new Game({ numPlayers:players });
    game.board.clear();
    for (const [coord, descriptor] of Object.entries(pieces)) {
        const cell = game.topology.cells.find(c => c.coord === coord);
        if (!cell) throw new Error(`Unknown coordinate ${coord}`);
        const [type, owner] = descriptor;
        game.board.set(cell.key,{ type, owner, moved:true, frozen:false });
    }
    game.castlingRights = [{ K:false,Q:false },{ K:false,Q:false }];
    game.repetitions.clear();
    return game;
}
export function cell(game, coord) { return game.topology.cells.find(c => c.coord === coord); }
export function move(game, from, to, type = 'Q', human = true) {
    const legal = game.getLegalMovesForCell(cell(game,from)).find(m => m.to.coord === to);
    if (!legal) throw new Error(`Illegal move ${from}-${to}`);
    return game.executeMove({ ...legal,promoteTo:type },{ human });
}
export class FakeClock {
    next = 1;
    tasks = new Map();
    setTimeout = (fn,ms) => { const id = this.next++; this.tasks.set(id,{fn,ms}); return id; };
    clearTimeout = id => this.tasks.delete(id);
    run() { const [id,task] = this.tasks.entries().next().value || []; if (task) { this.tasks.delete(id); task.fn(); } }
}
