import test from 'node:test';
import assert from 'node:assert/strict';
import { BoardTopology } from '../src/engine/topology.js';
import { Game } from '../src/engine/game.js';
import { serializeGame, restoreGame, validateSave } from '../src/engine/persistence.js';
const area=poly=>Math.abs(poly.reduce((sum,p,i)=>{const q=poly[(i+1)%poly.length];return sum+p.x*q.y-q.x*p.y;},0))/2;

test('three-arm trial covers its silhouette and keeps all 96 home-arm cells square',()=>{
    const t=new BoardTopology(3,'three-arm');t.computeGeometry(300);
    assert.equal(t.cells.length,144);
    assert.ok(Math.abs(t.cells.reduce((sum,c)=>sum+area(c.poly),0)-area(t.outerPolygon))<1e-6);
    for(const c of t.cells){
        assert.ok(area(c.poly)>0 && c.fitRadius>0);
        if(c.r<4){
            const [a,b,d]=c.poly,ab={x:b.x-a.x,y:b.y-a.y},bd={x:d.x-b.x,y:d.y-b.y};
            assert.ok(Math.abs(ab.x*bd.x+ab.y*bd.y)<1e-6);
            assert.ok(Math.abs(Math.hypot(ab.x,ab.y)-Math.hypot(bd.x,bd.y))<1e-6);
        }
    }
});
test('trial extends seam traversal through the playable center',()=>{
    const t=new BoardTopology(3,'three-arm');
    for(let s=0;s<3;s++)for(let f=0;f<8;f++){
        const entry=t.stepOrthogonal(s,3,f,1,0);
        assert.equal(entry.r,4);assert.equal(entry.s,s);
        const exit=t.stepOrthogonal(s,5,f,1,0),a=t.getCell(s,5,f),b=t.getCell(exit.s,exit.r,exit.f);
        assert.equal(exit.r,5);assert.equal(exit.dr,-1);
        assert.ok(a.poly.slice(2).every(p=>b.poly.slice(2).some(q=>Math.hypot(p.x-q.x,p.y-q.y)<1e-6)));
    }
    assert.equal(t.stepDiagonal(0,5,3,1,1).length,2);
});
test('three-arm moves, history, estimates and save restoration retain central cells',()=>{
    const g=new Game({numPlayers:3,boardStyle:'three-arm',seatsIsAI:Array(6).fill(false)});
    assert.equal(g.board.size,48);
    const origin=g.topology.getCell(0,3,2),target=g.topology.getCell(0,4,2);
    g.board.set(origin.key,{type:'R',owner:0,moved:true,frozen:false});
    const move=g.getLegalMovesForCell(origin).find(m=>m.to.key===target.key);
    assert.ok(move);g.executeMove(move);
    assert.equal(g.board.get(target.key).type,'R');
    assert.equal(g.estimateWinChances().reduce((a,b)=>a+b,0),100);
    const data=serializeGame(g);assert.equal(validateSave(data),true);
    const restored=new Game();restoreGame(restored,data);
    assert.equal(restored.boardStyle,'three-arm');assert.equal(restored.topology.cells.length,144);
    assert.equal(restored.board.get(target.key).type,'R');restored.undoMove();
    assert.equal(restored.board.get(origin.key).type,'R');
});
test('other player counts keep the original topology and old saves default to radial',()=>{
    for(const n of [2,4,5,6])assert.equal(new BoardTopology(n,'three-arm').cells.length,n*32);
    const data=serializeGame(new Game());delete data.options.boardStyle;
    const g=new Game({boardStyle:'three-arm'});restoreGame(g,data);
    assert.equal(g.boardStyle,'radial');assert.equal(g.topology.cells.length,96);
    data.options.boardStyle='unknown';assert.equal(validateSave(data),false);
    data.options.boardStyle='three-arm';data.options.numPlayers=4;assert.equal(validateSave(data),false);
});
