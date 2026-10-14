import { MASTER_PLAYERS } from '../engine/players.js';

export const PIECE_PATHS = {
    P: 'M7 21h10v-2H7z M8 18h8l-2-6h-4z M12 3a4 4 0 1 0 0 8a4 4 0 1 0 0-8',
    R: 'M5 21h14v-3H5z M7 17h10V9h2V3h-3v3h-2V3h-4v3H8V3H5v6h2z',
    N: 'M5 21h14v-3H5z M7 17h11l-1-8-4-6-4 1-5 7 4 2 4-4-1 4z M10 5h2V2h-2z',
    B: 'M5 21h14v-3H5z M8 17h8l-2-5c5-4 2-7-2-10L9 5l4 3-1 1-4-3c-3 4 0 6 2 6z',
    Q: 'M5 21h14v-3H5z M7 17h10l3-11-5 5-3-8-3 8-5-5z M3 3h3v3H3z M11 1h2v2h-2z M18 3h3v3h-3z',
    K: 'M5 21h14v-3H5z M7 17h10l2-7-4-3H9l-4 3z M11 1h2v2h3v2h-3v3h-2V5H8V3h3z',
};
export const PIECE_NAMES = { P: 'Pawn', R: 'Rook', N: 'Knight', B: 'Bishop', Q: 'Queen', K: 'King' };
export function pieceIcon(type, color = 'currentColor') {
    return `<svg class="piece-icon" aria-hidden="true" viewBox="0 0 24 24" fill="${color}"><path d="${PIECE_PATHS[type]}"/></svg>`;
}

export class BoardView {
    constructor(canvas, game, { interactive = false, onDescribe = () => {} } = {}) {
        this.canvas = canvas; this.game = game; this.interactive = interactive; this.onDescribe = onDescribe;
        this.focusKey = game.topology.getCell(0, 1, 4).key;
        this.observer = new ResizeObserver(() => this.draw()); this.observer.observe(canvas);
        if (interactive) {
            canvas.addEventListener('click', e => {
                const cell = this.cellAt(e.clientX, e.clientY);
                if (cell) { this.focusKey = cell.key; this.game.selectCell(cell); this.describe(cell); this.draw(); }
            });
            canvas.addEventListener('pointermove', e => { const cell = this.cellAt(e.clientX, e.clientY); if (cell) this.describe(cell); });
            canvas.addEventListener('focus', () => { this.describe(this.game.topology.cellMap.get(this.focusKey)); this.draw(); });
            canvas.addEventListener('blur', () => this.draw());
            canvas.addEventListener('keydown', e => this.key(e));
        }
    }
    describe(cell) {
        if (!cell) return;
        const piece = this.game.board.get(cell.key);
        const text = `${cell.coord}: ${piece ? MASTER_PLAYERS[piece.owner].name + ' ' + PIECE_NAMES[piece.type] + (piece.frozen ? ', frozen' : '') : 'empty'}${this.game.selectedCell?.key === cell.key ? ', selected' : ''}`;
        this.canvas.setAttribute('aria-label', `Chess board. ${text}. Arrow keys navigate, Enter selects or moves, Escape clears selection.`);
        this.onDescribe(text);
    }
    key(e) {
        const dirs = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
        let cell = this.game.topology.cellMap.get(this.focusKey) || this.game.topology.cells[0];
        if (dirs[e.key]) {
            e.preventDefault();
            const [dx, dy] = dirs[e.key];
            const candidates = this.game.topology.cells.map(c => {
                const x = c.center.x - cell.center.x, y = c.center.y - cell.center.y;
                const forward = x * dx + y * dy, side = Math.abs(x * dy - y * dx);
                return { cell: c, forward, score: Math.hypot(x, y) + side * 2 };
            }).filter(c => c.forward > 0.1).sort((a, b) => a.score - b.score);
            if (candidates.length) cell = candidates[0].cell;
            this.focusKey = cell.key; this.describe(cell); this.draw();
        } else if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault(); this.game.selectCell(cell); this.describe(cell); this.draw();
        } else if (e.key === 'Escape') {
            this.game.clearSelection(); this.game.emit(); this.describe(cell);
        }
    }
    cellAt(clientX, clientY) {
        const rect = this.canvas.getBoundingClientRect();
        const x = clientX - rect.left - this.size / 2, y = clientY - rect.top - this.size / 2;
        return this.game.topology.cells.find(cell => {
            const signs = cell.poly.map((a, i) => { const b = cell.poly[(i + 1) % 4]; return (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x); });
            return signs.every(v => v >= 0) || signs.every(v => v <= 0);
        });
    }
    draw() {
        const size = this.canvas.clientWidth;
        if (!size) return;
        this.size = size;
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = Math.round(size * dpr); this.canvas.height = Math.round(size * dpr);
        const ctx = this.canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, size, size); ctx.translate(size / 2, size / 2);
        const game = this.game; game.topology.computeGeometry(size * 0.45);
        const polyPath = poly => { ctx.beginPath(); poly.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath(); };
        polyPath(game.topology.outerPolygon); ctx.fillStyle = '#69513b'; ctx.fill(); ctx.strokeStyle = '#69513b'; ctx.lineWidth = 9; ctx.lineJoin = 'round'; ctx.stroke();
        const legal = new Map(game.legalMoves.map(m => [m.to.key, m]));
        const checked = new Set();
        for (let p = 0; p < game.numPlayers; p++) if (!game.eliminated[p] && game.isKingInCheck(p)) {
            for (const [key, piece] of game.board) if (piece.owner === p && piece.type === 'K') checked.add(key);
        }
        for (const cell of game.topology.cells) {
            polyPath(cell.poly); ctx.fillStyle = ['#f4e8cf', '#b49a75', '#d9c49e'][cell.colorIndex]; ctx.fill();
            ctx.strokeStyle = '#51412f'; ctx.lineWidth = 0.65; ctx.stroke();
            if (game.lastMoves.some(m => m && (m.from.key === cell.key || m.to.key === cell.key))) { ctx.fillStyle = '#a86a2038'; ctx.fill(); }
            if (game.selectedCell?.key === cell.key || game.hintMove?.to.key === cell.key) { ctx.fillStyle = '#ffffff77'; ctx.fill(); ctx.strokeStyle = '#24221e'; ctx.lineWidth = 2; ctx.stroke(); }
            const minEdge = Math.min(...cell.poly.map((p, i) => { const q = cell.poly[(i + 1) % 4]; return Math.hypot(p.x - q.x, p.y - q.y); }));
            const radius = Math.max(3, minEdge * 0.37);
            const piece = game.board.get(cell.key);
            if (piece) {
                ctx.save(); ctx.translate(cell.center.x, cell.center.y);
                ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2);
                ctx.fillStyle = '#fffcf5'; ctx.fill(); ctx.lineWidth = Math.max(2, radius * 0.2); ctx.strokeStyle = piece.frozen ? '#81786a' : MASTER_PLAYERS[piece.owner].primary; ctx.stroke();
                ctx.fillStyle = piece.frozen ? '#81786a' : '#24221e';
                const scale = radius * 1.65 / 24; ctx.scale(scale, scale); ctx.translate(-12, -12); ctx.fill(new Path2D(PIECE_PATHS[piece.type])); ctx.restore();
            }
            if (legal.has(cell.key)) {
                ctx.beginPath();
                if (legal.get(cell.key).capture) { ctx.arc(cell.center.x, cell.center.y, radius * 1.18, 0, Math.PI * 2); ctx.strokeStyle = '#24221e'; ctx.lineWidth = 2; ctx.setLineDash([3, 2]); ctx.stroke(); ctx.setLineDash([]); }
                else { ctx.arc(cell.center.x, cell.center.y, radius * 0.28, 0, Math.PI * 2); ctx.fillStyle = '#24221e'; ctx.fill(); }
            }
            if (checked.has(cell.key)) { ctx.fillStyle = '#24221e'; ctx.font = `bold ${Math.max(9, radius)}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText('!', cell.center.x, cell.center.y - radius * 1.3); }
            if (game.showCoords && (!piece || cell.r === 0)) {
                const p = cell.poly[0]; ctx.fillStyle = '#24221e'; ctx.font = `${Math.max(6, Math.min(10, size / 65))}px sans-serif`; ctx.textAlign = 'left'; ctx.fillText(cell.coord, p.x + 2, p.y - 2);
            }
            if (this.interactive && document.activeElement === this.canvas && cell.key === this.focusKey) { polyPath(cell.poly); ctx.strokeStyle = '#24221e'; ctx.lineWidth = 3; ctx.setLineDash([4, 2]); ctx.stroke(); ctx.setLineDash([]); }
        }
        for (const edge of game.topology.homeEdges) {
            ctx.beginPath(); ctx.moveTo(edge.p1.x, edge.p1.y); ctx.lineTo(edge.p2.x, edge.p2.y); ctx.strokeStyle = MASTER_PLAYERS[edge.p].primary; ctx.lineWidth = 4; ctx.stroke();
        }
    }
    destroy() { this.observer.disconnect(); }
}
