import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/engine/game.js';
import { attackTargets,positionKey } from '../src/engine/rules.js';
import { surfaceStep } from '../src/engine/surfaces.js';
import { serializeGame,restoreGame,validateSave } from '../src/engine/persistence.js';
const make=()=>new Game({numPlayers:2,boardStyle:'mobius',seatsIsAI:Array(6).fill(false)});
const cell=(g,c)=>g.topology.cells.find(cell=>cell.coord===c);
const put=(g,c,type,owner,extra={})=>{const at=cell(g,c);g.board.set(at.key,{type,owner,moved:true,frozen:false,...extra});return at;};
const play=(g,a,b,extra={})=>{const move=g.getLegalMovesForCell(cell(g,a)).find(m=>m.to===cell(g,b));assert.ok(move,`${a} to ${b}`);g.executeMove({...move,...extra});};
test('reference setup has 112 cells, 24 pieces per army and four directed pawn fronts',()=>{
    const g=make();assert.equal(g.topology.cells.length,112);assert.equal(g.board.size,48);
    for(const [rank,owner,direction] of [[2,0,1],[14,0,-1],[7,1,-1],[9,1,1]])for(let f=0;f<8;f++){
        const p=g.board.get(cell(g,`${String.fromCharCode(97+f)}${rank}`).key);assert.equal(p.type,'P');assert.equal(p.owner,owner);assert.equal(p.pawnDirection,direction);
    }
    assert.equal(g.board.get(cell(g,'e1').key).type,'K');assert.equal(g.board.get(cell(g,'e8').key).type,'K');
    assert.equal(g.isKingInCheck(0),false);assert.equal(g.isKingInCheck(1),false);assert.equal(g.getAllLegalMovesForPlayer(0).length,40);
    assert.deepEqual(g.estimateWinChances(),[50,50]);
    for(const c of g.topology.cells){assert.equal(g.topology.getCell(c.s,c.r,c.f),c);assert.equal(g.topology.key(c.s,c.r,c.f),c.key);}
});
test('rank 14 joins rank 1; only the 11/12 seam reverses files and diagonal file direction',()=>{
    assert.equal(surfaceStep('mobius',0,10,0,1).x,7);
    assert.equal(surfaceStep('mobius',7,11,0,-1).x,0);
    const diagonal=surfaceStep('mobius',1,10,1,1);assert.equal(diagonal.x,5);assert.equal(diagonal.dx,-1);assert.equal(diagonal.dy,1);
    const loop=surfaceStep('mobius',2,13,0,1);assert.equal(loop.x,2);assert.equal(loop.y,0);assert.equal(loop.flipped,false);
    assert.equal(surfaceStep('mobius',0,4,-1,0),null);
});
test('the reference bishop route f1–a6–b12 changes square color',()=>{
    const g=make();g.board.clear();let b=put(g,'f1','B',0);
    assert.ok(g.getPseudoMovesForCell(b).some(m=>m.to===cell(g,'a6')));
    g.board.clear();b=put(g,'a6','B',0);
    assert.ok(g.getPseudoMovesForCell(b).some(m=>m.to===cell(g,'b12')));
    assert.notEqual(cell(g,'f1').colorIndex,cell(g,'b12').colorIndex);
});
test('long rays terminate, knights cross the twist, and kings attack across both joins',()=>{
    const g=make();g.board.clear();const r=put(g,'a11','R',0);
    const moves=g.getPseudoMovesForCell(r);assert.equal(moves.length,33);assert.equal(new Set(moves.map(m=>m.to.key)).size,moves.length);
    assert.ok(moves.some(m=>m.to===cell(g,'h12')));
    g.board.clear();const n=put(g,'b11','N',0);assert.ok(g.getPseudoMovesForCell(n).some(m=>m.to===cell(g,'f13')));
    g.board.clear();put(g,'a11','K',0);let k=put(g,'h12','K',1);assert.ok(attackTargets(g,k).includes(cell(g,'a11').key));
    g.board.clear();put(g,'c1','K',0);k=put(g,'c14','K',1);assert.ok(attackTargets(g,k).includes(cell(g,'c1').key));
});
test('all pawn fronts double-step and preserve their direction across the twist',()=>{
    const g=make();
    for(const [a,b] of [['e2','e4'],['e14','e12'],['e7','e5'],['e9','e11']])assert.ok(g.getPseudoMovesForCell(cell(g,a)).some(m=>m.to===cell(g,b)&&m.doublePawn));
    g.board.clear();put(g,'e1','K',0);put(g,'e8','K',1);put(g,'b11','P',1,{pawnDirection:1});g.turn=1;
    play(g,'b11','g12');assert.equal(g.board.get(cell(g,'g12').key).pawnDirection,1);
    assert.ok(g.getPseudoMovesForCell(cell(g,'g12')).some(m=>m.to===cell(g,'g13')));
});
test('both Gold fronts promote on 8 and both Crimson fronts on 1, including the loop',()=>{
    for(const [a,b,owner,direction] of [['a7','a8',0,1],['a9','a8',0,-1],['a2','a1',1,-1],['a14','a1',1,1]]) {
        const g=make();g.board.clear();put(g,'e1','K',0);put(g,'e8','K',1);put(g,a,'P',owner,{pawnDirection:direction});g.turn=owner;
        play(g,a,b,{promoteTo:'N'});assert.equal(g.board.get(cell(g,b).key).type,'N');
    }
});
test('rear-front en passant works and home-rank castling remains available',()=>{
    const g=make();g.board.clear();put(g,'e1','K',0);put(g,'e8','K',1);put(g,'e14','P',0,{pawnDirection:-1,moved:false});put(g,'d12','P',1,{pawnDirection:1});
    play(g,'e14','e12');assert.equal(g.enPassant.target,cell(g,'e13').key);play(g,'d12','e13');assert.equal(g.board.has(cell(g,'e12').key),false);
    for(const [owner,rank] of [[0,1],[1,8]]){
        g.board.clear();const king=put(g,`e${rank}`,'K',owner,{moved:false});put(g,`a${rank}`,'R',owner,{moved:false});put(g,`h${rank}`,'R',owner,{moved:false});
        g.castlingRights=[{K:true,Q:true},{K:true,Q:true}];assert.equal(g.getLegalMovesForCell(king).filter(m=>m.castle).length,2);
    }
});
test('reference saves and undo retain rear pawns, rules revision and direction-aware repetition',()=>{
    const g=make();play(g,'e14','e12');const data=serializeGame(g);assert.equal(data.options.mobiusVersion,2);assert.ok(validateSave(data));
    const restored=make();restoreGame(restored,data);assert.equal(restored.boardStyle,'mobius');assert.equal(restored.board.size,48);
    const key=positionKey(restored);restored.board.get(cell(restored,'e12').key).pawnDirection=1;assert.notEqual(positionKey(restored),key);
    restored.undoMove();assert.equal(restored.board.get(cell(restored,'e14').key).pawnDirection,-1);
    const invalid=structuredClone(data);invalid.state.board.find(([,p])=>p.type==='P')[1].pawnDirection=0;assert.equal(validateSave(invalid),false);
    delete invalid.options.mobiusVersion;assert.equal(validateSave(invalid),false);
});
test('old 8x8 Möbius saves restore under their original rules without losing the position',()=>{
    const old=new Game({numPlayers:2,boardStyle:'mobius-8x8'}),data=serializeGame(old);data.options.boardStyle='mobius';
    assert.equal(validateSave(data),true);const g=make();restoreGame(g,data);
    assert.equal(g.boardStyle,'mobius-8x8');assert.equal(g.topology.cells.length,64);assert.deepEqual(g.snapshot(),old.snapshot());
    assert.equal(serializeGame(g).options.boardStyle,'mobius-8x8');
});
