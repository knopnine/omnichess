import { MASTER_PLAYERS } from '../engine/players.js';
import { MoveAnimation, surfacePose } from './motion.js';
import { uniformPieceFit } from '../engine/geometry.js';

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
        this.motion = new MoveAnimation({
            requestFrame:fn=>window.requestAnimationFrame(fn),cancelFrame:id=>window.cancelAnimationFrame(id),
            now:()=>performance.now(),reducedMotion:()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches,
            onFrame:()=>this.draw(),onFinish:()=>this.game.unsuspend('piece-movement'),
        });
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
    get isAnimating() { return !!this.motion.active; }
    animateMove(move) {
        if(!this.interactive || !this.game.inArena)return;
        if(this.motion.start({...move,topology:this.game.topology},Math.min(220,Math.max(80,this.game.aiDelay*.5))))this.game.suspend('piece-movement');
    }
    cancelAnimation() { this.motion.cancel(); }
    drawPiece(ctx,point,piece,fitRadius,opacity=1) {
        const radius=fitRadius*.8;
        ctx.save();ctx.globalAlpha=opacity;ctx.translate(point.x,point.y);
        ctx.beginPath();ctx.arc(0,0,radius,0,Math.PI*2);
        ctx.fillStyle='#fffcf5';ctx.fill();ctx.lineWidth=Math.min(4,fitRadius*.22);
        ctx.strokeStyle=piece.frozen?'#81786a':MASTER_PLAYERS[piece.owner].primary;ctx.stroke();
        ctx.fillStyle=piece.frozen?'#81786a':'#24221e';
        const scale=radius*1.65/24;ctx.scale(scale,scale);ctx.translate(-12,-12);
        ctx.fill(new Path2D(PIECE_PATHS[piece.type]));ctx.restore();
    }
    describe(cell) {
        if (!cell) return;
        const piece = this.game.board.get(cell.key);
        const direction=piece?.type==='P' && this.game.boardStyle==='mobius' ? `, advances ${piece.pawnDirection===1?'up':'down'} the ranks, promotes on rank ${piece.owner===0?8:1}` : piece?.type==='P' && this.game.boardStyle==='mobius-8x8' ? `, forward toward rank ${(piece.owner===0)!==!!piece.pawnTwisted?8:1}` : '';
        const text = `${cell.coord}: ${piece ? MASTER_PLAYERS[piece.owner].name + ' ' + PIECE_NAMES[piece.type] + (piece.frozen ? ', frozen' : '') + direction : 'empty'}${this.game.selectedCell?.key === cell.key ? ', selected' : ''}`;
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
        if(this.game.boardStyle==='donut') {
            const radius=Math.hypot(x,y),inner=this.game.topology.holeRadius,width=this.size*.45*.085;
            const rank=Math.floor((radius-inner)/width);
            if(rank<0 || rank>7)return null;
            const file=Math.floor(((Math.atan2(y,x)+Math.PI/2+Math.PI*2)%(Math.PI*2))/(Math.PI/4));
            return rank<4?this.game.topology.getCell(0,rank,file):this.game.topology.getCell(1,7-rank,7-file);
        }
        return this.game.topology.cells.find(cell => {
            const signs = cell.poly.map((a, i) => { const b = cell.poly[(i + 1) % 4]; return (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x); });
            return signs.every(v => v >= 0) || signs.every(v => v <= 0);
        });
    }
    draw() {
        const active=this.motion.active;
        if(active && (active.data.topology!==this.game.topology || active.data.ply!==this.game.plyCount || !this.game.inArena))this.cancelAnimation();
        const size = this.canvas.clientWidth;
        if (!size) return;
        this.size = size;
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = Math.round(size * dpr); this.canvas.height = Math.round(size * dpr);
        const ctx = this.canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, size, size); ctx.translate(size / 2, size / 2);
        const game = this.game; game.topology.computeGeometry(size * 0.45);
        const pieceFit=uniformPieceFit(game.topology);
        const motion=this.motion.active;
        this.canvas.setAttribute('aria-busy',String(!!motion));
        const hiddenPieces=new Set(motion?motion.data.pieces.map(p=>p.to):[]);
        const polyPath = poly => { ctx.beginPath(); poly.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath(); };
        polyPath(game.topology.outerPolygon); ctx.fillStyle = '#69513b'; ctx.fill(); ctx.strokeStyle = '#69513b'; ctx.lineWidth = 9; ctx.lineJoin = 'round'; ctx.stroke();
        const legal = new Map(game.legalMoves.map(m => [m.to.key, m]));
        const checked = new Set();
        for (let p = 0; p < game.numPlayers; p++) if (!game.eliminated[p] && game.isKingInCheck(p)) {
            for (const [key, piece] of game.board) if (piece.owner === p && piece.type === 'K') checked.add(key);
        }
        for (const cell of game.topology.cells) {
            polyPath(cell.renderPoly || cell.poly); ctx.fillStyle = ['#f4e8cf', '#b49a75', '#d9c49e'][cell.colorIndex]; ctx.fill();
            ctx.strokeStyle = '#51412f'; ctx.lineWidth = 0.65; ctx.stroke();
            if (game.lastMoves.some(m => m && (m.from.key === cell.key || m.to.key === cell.key))) { ctx.fillStyle = '#a86a2038'; ctx.fill(); }
            if (game.selectedCell?.key === cell.key || game.hintMove?.to.key === cell.key) { ctx.fillStyle = '#ffffff77'; ctx.fill(); ctx.strokeStyle = '#24221e'; ctx.lineWidth = 2; ctx.stroke(); }
            const radius = pieceFit * 0.8;
            const piece = game.board.get(cell.key);
            if (piece && !hiddenPieces.has(cell.key)) this.drawPiece(ctx,cell.center,piece,pieceFit);
            if (legal.has(cell.key)) {
                ctx.beginPath();
                if (legal.get(cell.key).capture) { ctx.arc(cell.center.x, cell.center.y, pieceFit * 0.94, 0, Math.PI * 2); ctx.strokeStyle = '#24221e'; ctx.lineWidth = pieceFit*0.06; ctx.setLineDash([3, 2]); ctx.stroke(); ctx.setLineDash([]); }
                else { ctx.arc(cell.center.x, cell.center.y, radius * 0.28, 0, Math.PI * 2); ctx.fillStyle = '#24221e'; ctx.fill(); }
            }
            if (checked.has(cell.key)) { ctx.fillStyle = '#24221e'; ctx.font = `bold ${Math.max(9, radius)}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText('!', cell.center.x, cell.center.y - radius * 1.3); }
            if (game.showCoords && (!piece || cell.r === 0)) {
                ctx.fillStyle = '#24221e';
                if(!piece) {
                    const font=Math.min(10,cell.fitRadius*.7);
                    ctx.font=`${font}px sans-serif`;ctx.textAlign='center';
                    ctx.fillText(cell.coord,cell.center.x,cell.center.y+font*.3,cell.fitRadius*1.6);
                } else {
                    const p=cell.poly[0];ctx.font=`${Math.max(6,Math.min(10,size/65))}px sans-serif`;ctx.textAlign='left';ctx.fillText(cell.coord,p.x+2,p.y-2);
                }
            }
            if (this.interactive && document.activeElement === this.canvas && cell.key === this.focusKey) { polyPath(cell.poly); ctx.strokeStyle = '#24221e'; ctx.lineWidth = 3; ctx.setLineDash([4, 2]); ctx.stroke(); ctx.setLineDash([]); }
        }
        if (game.topology.rosettePolygon.length) {
            polyPath(game.topology.rosettePolygon); ctx.strokeStyle='#69513b'; ctx.lineWidth=1.8; ctx.stroke();
        }
        if(game.boardStyle==='donut') {
            ctx.beginPath();ctx.arc(0,0,game.topology.holeRadius,0,Math.PI*2);ctx.fillStyle='#f5f0e6';ctx.fill();ctx.strokeStyle='#69513b';ctx.lineWidth=2;ctx.stroke();
            ctx.fillStyle='#69513b';ctx.font=`${Math.max(9,size/45)}px sans-serif`;ctx.textAlign='center';ctx.fillText('a ↔ h',0,0);
        }
        if(game.boardStyle==='mobius') {
            const half=game.topology.cells[0].fitRadius*8,seam=game.topology.mobiusSeamY,unit=game.topology.cells[0].fitRadius*2;
            ctx.strokeStyle='#69513b';ctx.lineWidth=3;ctx.setLineDash([5,3]);ctx.beginPath();ctx.moveTo(-half,seam);ctx.lineTo(half,seam);ctx.stroke();ctx.setLineDash([]);
            ctx.fillStyle='#69513b';ctx.font=`${Math.max(9,size/65)}px sans-serif`;ctx.textAlign='left';
            ctx.fillText('a11 ↔ h12',half+8,seam-3);ctx.fillText('b11 ↔ g12',half+8,seam+12);
            ctx.textAlign='right';for(let rank=1;rank<=14;rank++)ctx.fillText(String(rank),-half-8,(7.5-rank)*unit+3);
            ctx.textAlign='center';for(let file=0;file<8;file++)ctx.fillText(String.fromCharCode(97+file),(file-3.5)*unit,7*unit+13);
            ctx.fillText('14 ↔ 1 · continuous loop',0,-7*unit-10);ctx.fillText('Möbius · 8 × 14 unfolded map',0,7*unit+32);
        }
        if(game.boardStyle==='mobius-8x8') {
            const side=size*.45*.86;
            ctx.strokeStyle='#69513b';ctx.lineWidth=3;ctx.setLineDash([6,4]);
            for(const x of [-side,side]){ctx.beginPath();ctx.moveTo(x,-side);ctx.lineTo(x,side);ctx.stroke();}ctx.setLineDash([]);
            ctx.fillStyle='#69513b';ctx.font=`${Math.max(9,size/52)}px sans-serif`;ctx.textAlign='center';
            ctx.fillText('a1 ↔ h8 · a2 ↔ h7 · … · a8 ↔ h1',0,-side-12);
            ctx.fillText('Möbius strip · unfolded map',0,side+20);
        }
        for (const edge of game.topology.homeEdges) {
            ctx.beginPath(); ctx.moveTo(edge.p1.x, edge.p1.y); ctx.lineTo(edge.p2.x, edge.p2.y); ctx.strokeStyle = MASTER_PLAYERS[edge.p].primary; ctx.lineWidth = 4; ctx.stroke();
        }
        if(motion) {
            const captured=motion.data.captured;
            if(captured){const cell=game.topology.cellMap.get(captured.key);this.drawPiece(ctx,cell.center,captured.piece,pieceFit,1-motion.progress);}
            for(const moving of motion.data.pieces){
                const from=game.topology.cellMap.get(moving.from),to=game.topology.cellMap.get(moving.to);
                const pose=surfacePose(game.boardStyle,from,to,motion.progress,pieceFit,moving.travelFiles,moving.crossedSeam);
                this.drawPiece(ctx,pose,moving.piece,pose.fitRadius,pose.opacity??1);
            }
        }
    }
    destroy() { this.motion.cancel();this.observer.disconnect(); }
}
