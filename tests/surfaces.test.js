import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/engine/game.js';
import { attackTargets,positionKey,insufficientMaterial } from '../src/engine/rules.js';
import { surfaceStep } from '../src/engine/surfaces.js';
import { serializeGame,restoreGame,validateSave } from '../src/engine/persistence.js';
import { surfacePose } from '../src/ui/motion.js';
import { BoardView } from '../src/ui/board.js';
const make=boardStyle=>new Game({numPlayers:2,boardStyle:boardStyle==='mobius'?'mobius-8x8':boardStyle,seatsIsAI:Array(6).fill(false)});
const cell=(g,coord)=>g.topology.cells.find(c=>c.coord===coord);
const put=(g,coord,type,owner,extra={})=>{const c=cell(g,coord);g.board.set(c.key,{type,owner,moved:true,frozen:false,...extra});return c;};
const play=(g,a,b,extra={})=>{const m=g.getLegalMovesForCell(cell(g,a)).find(m=>m.to===cell(g,b));assert.ok(m,`${a} to ${b}`);return g.executeMove({...m,...extra});};
for(const style of ['donut','mobius']) {
    test(`${style} starts safely, generates unique finite moves, and keeps king captures illegal`,()=>{
        const g=make(style);assert.equal(g.topology.cells.length,64);
        assert.equal(g.isKingInCheck(0),false);assert.equal(g.isKingInCheck(1),false);
        assert.equal(g.getAllLegalMovesForPlayer(0).length,style==='donut'?20:24);
        g.board.clear();const rook=put(g,'a2','R',0);put(g,'a8','K',1);put(g,'e1','K',0);
        const moves=g.getLegalMovesForCell(rook);assert.equal(new Set(moves.map(m=>m.to.key)).size,moves.length);
        assert.ok(!moves.some(m=>m.to===cell(g,'a8')));
    });
    test(`${style} preserves home castling and rejects attacked transit squares`,()=>{
        const g=make(style);g.board.clear();const king=put(g,'e1','K',0,{moved:false});put(g,'e8','K',1);
        put(g,'a1','R',0,{moved:false});put(g,'h1','R',0,{moved:false});
        assert.equal(g.getLegalMovesForCell(king).filter(m=>m.castle).length,2);
        put(g,'f7','R',1);assert.ok(!g.getLegalMovesForCell(king).some(m=>m.castle==='K'));
    });
    test(`${style} supports ordinary en passant and clears it on the next move`,()=>{
        const g=make(style);g.board.clear();put(g,'e1','K',0);put(g,'e8','K',1);
        put(g,'e5','P',0);put(g,'d7','P',1,{moved:false});g.turn=1;play(g,'d7','d5');
        assert.equal(g.enPassant.target,cell(g,'d6').key);play(g,'e5','d6');
        assert.equal(g.board.has(cell(g,'d5').key),false);assert.equal(g.enPassant,null);
    });
    test(`${style} restores settings and undo history, rejects other player counts`,()=>{
        const g=make(style);play(g,'e2','e4');const data=serializeGame(g);assert.ok(validateSave(data));
        const restored=make('radial');restoreGame(restored,data);assert.equal(restored.boardStyle,g.boardStyle);
        restored.undoMove();assert.equal(restored.board.get(cell(restored,'e2').key).type,'P');
        data.options.numPlayers=3;assert.equal(validateSave(data),false);
    });
    test(`${style} keeps only king-versus-king as its conservative material draw`,()=>{
        const g=make(style);g.board.clear();put(g,'e1','K',0);put(g,'e8','K',1);
        assert.equal(insufficientMaterial(g),true);put(g,'c3','B',0);assert.equal(insufficientMaterial(g),false);
    });
}
test('donut wraps files at the same rank and leaves inner/outer edges open',()=>{
    assert.deepEqual(surfaceStep('donut',7,1,1,0),{x:0,y:1,dx:1,dy:0,flipped:false,travelFiles:1});
    assert.equal(surfaceStep('donut',4,7,0,1),null);
    const g=make('donut');g.board.clear();const rook=put(g,'a2','R',0);
    assert.equal(g.getPseudoMovesForCell(rook).length,14);
    put(g,'h2','P',1);const moves=g.getPseudoMovesForCell(rook);
    assert.ok(moves.some(m=>m.to===cell(g,'h2')&&m.capture));
    assert.ok(moves.some(m=>m.to===cell(g,'g2'))); // The other route remains open.
});
test('Möbius reverses ranks and ray direction at the joined files',()=>{
    assert.deepEqual(surfaceStep('mobius-8x8',7,1,1,0),{x:0,y:6,dx:1,dy:0,flipped:true,travelFiles:1});
    const next=surfaceStep('mobius-8x8',7,2,1,1);assert.equal(next.y,4);assert.equal(next.dy,-1);
    const g=make('mobius');g.board.clear();const rook=put(g,'a2','R',0);
    const moves=g.getPseudoMovesForCell(rook);assert.ok(moves.some(m=>m.to===cell(g,'h7')));
    assert.ok(moves.some(m=>m.to===cell(g,'a7')));assert.equal(moves.length,21);
});
test('Möbius kings attack across the reversed seam',()=>{
    const g=make('mobius');g.board.clear();put(g,'a1','K',0);const enemy=put(g,'h8','K',1);
    assert.ok(attackTargets(g,enemy).includes(cell(g,'a1').key));assert.equal(g.isKingInCheck(0),true);
});
test('en passant works across the donut join and the Möbius reversed join',()=>{
    const g=make('donut');g.board.clear();put(g,'e1','K',0);put(g,'e8','K',1);put(g,'h5','P',0);put(g,'a7','P',1,{moved:false});
    g.turn=1;play(g,'a7','a5');play(g,'h5','a6');assert.equal(g.board.has(cell(g,'a5').key),false);
    const m=make('mobius');m.board.clear();put(m,'e1','K',0);put(m,'e8','K',1);put(m,'a2','P',0,{moved:false});put(m,'h5','P',1,{pawnTwisted:true});
    play(m,'a2','a4');play(m,'h5','a3');assert.equal(m.board.has(cell(m,'a4').key),false);assert.equal(m.board.get(cell(m,'a3').key).pawnTwisted,false);
});
test('Möbius pawn captures flip its direction, survive saving, and distinguish repetition keys',()=>{
    const g=make('mobius');g.board.clear();put(g,'e1','K',0);put(g,'e8','K',1);
    const pawn=put(g,'h2','P',0);put(g,'a6','N',1);
    play(g,'h2','a6');assert.equal(g.board.get(cell(g,'a6').key).pawnTwisted,true);assert.equal(g.enPassant,null);
    const data=serializeGame(g),restored=make('radial');restoreGame(restored,data);
    const key=positionKey(restored),p=restored.board.get(cell(restored,'a6').key);p.pawnTwisted=false;
    assert.notEqual(positionKey(restored),key);p.pawnTwisted=true;
    assert.ok(restored.getPseudoMovesForCell(cell(restored,'a6')).some(m=>m.to===cell(restored,'a5')));
    restored.undoMove();assert.equal(restored.board.get(pawn.key).type,'P');
    data.state.board.find(([key])=>key===cell(g,'a6').key)[1].pawnTwisted='bad';assert.equal(validateSave(data),false);
});
test('a reversed Möbius pawn underpromotes at its new forward edge',()=>{
    const g=make('mobius');g.board.clear();put(g,'e1','K',0);put(g,'e8','K',1);put(g,'a2','P',0,{pawnTwisted:true});
    play(g,'a2','a1',{promoteTo:'N'});assert.equal(g.board.get(cell(g,'a1').key).type,'N');
});
test('donut hit-testing excludes the hole and maps every cell center correctly',()=>{
    const g=make('donut');g.topology.computeGeometry(225);
    const view={game:g,size:500,canvas:{getBoundingClientRect:()=>({left:0,top:0})}};
    assert.equal(BoardView.prototype.cellAt.call(view,250,250),null);
    for(const c of g.topology.cells)assert.equal(BoardView.prototype.cellAt.call(view,250+c.center.x,250+c.center.y),c);
});
test('surface animations keep donut travel outside the hole and fade Möbius seam crossings',()=>{
    const g=make('donut');g.topology.computeGeometry(300);const a=cell(g,'a1'),b=cell(g,'h1');
    for(const p of [0,.25,.5,.75,1]){const pose=surfacePose('donut',a,b,p,5,-1);assert.ok(Math.hypot(pose.x,pose.y)>g.topology.holeRadius);}
    const m=make('mobius'),from=cell(m,'h2'),to=cell(m,'a7');
    assert.equal(surfacePose('mobius-8x8',from,to,.5,5,1).opacity,0);
    assert.equal(surfacePose('mobius-8x8',from,to,1,5,1).x,to.center.x);
});
