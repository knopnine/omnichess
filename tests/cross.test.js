import test from 'node:test';
import assert from 'node:assert/strict';
import { BoardTopology } from '../src/engine/topology.js';
import { Game } from '../src/engine/game.js';
import { attackTargets } from '../src/engine/rules.js';
import { serializeGame,restoreGame,validateSave } from '../src/engine/persistence.js';
const game=()=>new Game({numPlayers:4,boardStyle:'cross',seatsIsAI:Array(6).fill(false)});
const put=(g,x,y,type,owner,moved=true)=>{const c=g.topology.gridCell(x,y);g.board.set(c.key,{type,owner,moved,frozen:false});return c;};
const destinations=(g,c)=>new Set(g.getPseudoMovesForCell(c).map(m=>m.to.key));

test('cross has 192 equal square cells, an 8x8 center and no corner cells',()=>{
    const t=new BoardTopology(4,'cross');t.computeGeometry(300);
    assert.equal(t.cells.length,192);assert.equal(t.cells.filter(c=>c.s===4).length,64);
    for(let s=0;s<4;s++)assert.equal(t.cells.filter(c=>c.s===s).length,32);
    for(const [x,y] of [[0,0],[15,0],[0,15],[15,15]])assert.equal(t.gridCell(x,y),null);
    const unit=t.cells[0].fitRadius*2;
    for(const c of t.cells)for(let i=0;i<4;i++){
        const a=c.poly[i],b=c.poly[(i+1)%4],d=c.poly[(i+2)%4];
        assert.ok(Math.abs(Math.hypot(b.x-a.x,b.y-a.y)-unit)<1e-7);
        assert.ok(Math.abs((b.x-a.x)*(d.x-b.x)+(b.y-a.y)*(d.y-b.y))<1e-7);
    }
});
test('rook crosses the whole center in straight lines; bishops stop at missing corners',()=>{
    const g=game();g.board.clear();const rook=put(g,7,13,'R',0);
    assert.ok(destinations(g,rook).has(g.topology.gridCell(7,0).key));
    assert.equal(destinations(g,rook).size,22);
    g.board.clear();const bishop=put(g,4,4,'B',0);
    assert.equal(destinations(g,bishop).size,15);
    assert.ok(destinations(g,bishop).has(g.topology.gridCell(13,13)?.key)===false);
    put(g,7,7,'P',1);assert.ok(destinations(g,bishop).has(g.topology.gridCell(7,7).key));
    assert.ok(!destinations(g,bishop).has(g.topology.gridCell(8,8).key));
});
test('knights jump over occupied joins but cannot land in absent corners',()=>{
    const g=game();const knight=put(g,4,4,'N',0);
    const moves=destinations(g,knight);
    assert.equal(moves.size,6);
    assert.ok(moves.has(g.topology.gridCell(2,5).key));
});
test('each army advances toward its opposite arm, with pawn attacks separate from advances',()=>{
    const g=game();g.board.clear();
    for(const [owner,x,y,tx,ty] of [[0,7,7,7,6],[1,7,7,8,7],[2,7,7,7,8],[3,7,7,6,7]]){
        g.board.clear();const c=put(g,x,y,'P',owner);
        assert.ok(destinations(g,c).has(g.topology.gridCell(tx,ty).key));
        assert.ok(!attackTargets(g,c).includes(g.topology.gridCell(tx,ty).key));
        assert.equal(attackTargets(g,c).length,2);
    }
});
test('all four armies can promote at the opposite outer rank',()=>{
    const g=game();
    for(const [owner,x,y,tx,ty] of [[0,7,1,7,0],[1,14,7,15,7],[2,7,14,7,15],[3,1,7,0,7]]){
        g.board.clear();const c=put(g,x,y,'P',owner);
        const move=g.getPseudoMovesForCell(c).find(m=>m.to.x===tx&&m.to.y===ty);
        assert.equal(move.promotion,true);assert.equal(g.simulateMove({...move,promoteTo:'N'}).get(move.to.key).type,'N');
    }
});
test('castling and check legality operate on every cross arm',()=>{
    for(let owner=0;owner<4;owner++){
        const g=game();g.board.clear();const k=g.topology.getCell(owner,0,4);
        g.board.set(k.key,{type:'K',owner,moved:false,frozen:false});
        for(const f of [0,7])g.board.set(g.topology.key(owner,0,f),{type:'R',owner,moved:false,frozen:false});
        assert.equal(g.getLegalMovesForCell(k).filter(m=>m.castle).length,2);
        const transit=g.topology.getCell(owner,0,5);
        const threat=g.topology.getCell(owner,3,5);
        g.board.set(threat.key,{type:'R',owner:(owner+1)%4,moved:true,frozen:false});
        assert.ok(!g.getLegalMovesForCell(k).some(m=>m.castle==='K'));
        assert.ok(attackTargets(g,threat).includes(transit.key));
    }
});
test('central positions round-trip with undo, estimates, and move animation events',()=>{
    const g=game(),from=g.topology.getCell(0,3,2),to=g.topology.gridCell(from.x,11);
    g.board.set(from.key,{type:'R',owner:0,moved:true,frozen:false});
    let animation;g.onMove=e=>animation=e;
    const m=g.getLegalMovesForCell(from).find(m=>m.to.key===to.key);assert.ok(m);g.executeMove(m);
    assert.equal(animation.pieces[0].to,to.key);assert.equal(g.estimateWinChances().reduce((a,b)=>a+b,0),100);
    const data=serializeGame(g);assert.equal(validateSave(data),true);
    const restored=game();restoreGame(restored,data);assert.equal(restored.boardStyle,'cross');assert.equal(restored.board.get(to.key).type,'R');
    restored.undoMove();assert.equal(restored.board.get(from.key).type,'R');
    data.options.numPlayers=3;assert.equal(validateSave(data),false);
});
test('cross king captures preserve conquest and first-checkmate termination',()=>{
    for(const victoryMode of ['last_standing','first_checkmate']) {
        const g=game();g.victoryMode=victoryMode;
        g.board.delete(g.topology.key(1,0,4));
        const from=put(g,7,9,'R',0),king=put(g,7,8,'K',1),pawn=put(g,8,8,'P',1);
        const move=g.getLegalMovesForCell(from).find(m=>m.to.key===king.key);assert.ok(move);g.executeMove(move);
        assert.equal(g.eliminated[1],true);
        assert.equal(g.gameOver,victoryMode==='first_checkmate');
        if(!g.gameOver)assert.equal(g.board.get(pawn.key).owner,0);
        else assert.equal(g.winnerId,0);
    }
});
