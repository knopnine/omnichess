import test from 'node:test';
import assert from 'node:assert/strict';
import { BoardTopology } from '../src/engine/topology.js';
import { Game } from '../src/engine/game.js';
import { serializeGame,restoreGame,validateSave } from '../src/engine/persistence.js';
const area=poly=>Math.abs(poly.reduce((sum,p,i)=>{const q=poly[(i+1)%poly.length];return sum+p.x*q.y-q.x*p.y;},0))/2;
const make=(n,style)=>new Game({numPlayers:n,boardStyle:style,seatsIsAI:Array(6).fill(false)});
for(const [n,style] of [[5,'five-arm'],[6,'six-arm']]) {
    test(`${style} covers its silhouette with square arms and convex playable center cells`,()=>{
        const t=new BoardTopology(n,style);t.computeGeometry(300);
        assert.equal(t.cells.length,n*48);assert.equal(t.cells.filter(c=>c.r<4).length,n*32);
        assert.ok(Math.abs(t.cells.reduce((sum,c)=>sum+area(c.poly),0)-area(t.outerPolygon))<1e-6);
        for(const c of t.cells) {
            assert.ok(area(c.poly)>0 && c.fitRadius>10);
            const signed=c.poly.reduce((sum,a,i)=>{const b=c.poly[(i+1)%4];return sum+a.x*b.y-b.x*a.y;},0);
            for(let i=0;i<4;i++) {
                const a=c.poly[i],b=c.poly[(i+1)%4],d=c.poly[(i+2)%4];
                const cross=(b.x-a.x)*(d.y-b.y)-(b.y-a.y)*(d.x-b.x);
                assert.ok(cross*Math.sign(signed)>=-1e-6);
                if(c.r<4) {
                    assert.ok(Math.abs((b.x-a.x)*(d.x-b.x)+(b.y-a.y)*(d.y-b.y))<1e-6);
                    assert.ok(Math.abs(Math.hypot(b.x-a.x,b.y-a.y)-Math.hypot(d.x-b.x,d.y-b.y))<1e-6);
                }
            }
        }
    });
    test(`${style} joins arm cells and opposing sector seams without geometric gaps`,()=>{
        const t=new BoardTopology(n,style);t.computeGeometry(300);
        for(let s=0;s<n;s++)for(let f=0;f<8;f++) {
            for(const r of [3,5]) {
                const a=t.getCell(s,r,f),step=t.stepOrthogonal(s,r,f,1,0),b=t.getCell(step.s,step.r,step.f);
                assert.ok(a.poly.slice(2).every(p=>b.poly.some(q=>Math.hypot(p.x-q.x,p.y-q.y)<1e-6)));
            }
            assert.equal(t.stepDiagonal(s,5,3,1,1).length,n-1);
        }
    });
    test(`${style} central moves, animation events, estimates, save/restore and undo work together`,()=>{
        const g=make(n,style),from=g.topology.getCell(0,3,2),to=g.topology.getCell(0,4,2);
        assert.equal(g.board.size,n*16);
        assert.equal(g.estimateWinChances().reduce((a,b)=>a+b,0),100);
        g.board.set(from.key,{type:'R',owner:0,moved:true,frozen:false});
        let event;g.onMove=e=>event=e;
        const m=g.getLegalMovesForCell(from).find(m=>m.to.key===to.key);assert.ok(m);g.executeMove(m);
        assert.equal(event.pieces[0].to,to.key);
        const data=serializeGame(g);assert.equal(validateSave(data),true);
        const restored=new Game();restoreGame(restored,data);
        assert.equal(restored.boardStyle,style);assert.equal(restored.board.get(to.key).type,'R');
        restored.undoMove();assert.equal(restored.board.get(from.key).type,'R');
        data.options.numPlayers=n===5?6:5;assert.equal(validateSave(data),false);
        assert.equal(new BoardTopology(n===5?6:5,style).boardStyle,'radial');
    });
    for(const mode of ['conquest','freeze','remove','first_checkmate'])test(`${style} retains ${mode} king-capture behavior`,()=>{
        const g=make(n,style);
        g.victoryMode=mode==='remove'?'remove_eliminated':mode==='first_checkmate'?mode:'last_standing';
        g.convertOnKingKill=mode==='conquest';
        const from=g.topology.getCell(0,4,2),to=g.topology.getCell(0,5,2),pawn=g.topology.getCell(1,1,0);
        g.board.delete(g.topology.key(1,0,4));
        g.board.set(from.key,{type:'R',owner:0,moved:true,frozen:false});g.board.set(to.key,{type:'K',owner:1,moved:true,frozen:false});
        const m=g.getLegalMovesForCell(from).find(m=>m.to.key===to.key);assert.ok(m);g.executeMove(m);
        assert.equal(g.eliminated[1],true);
        if(mode==='conquest')assert.equal(g.board.get(pawn.key).owner,0);
        if(mode==='freeze')assert.equal(g.board.get(pawn.key).frozen,true);
        if(mode==='remove')assert.equal(g.board.has(pawn.key),false);
        if(mode==='first_checkmate'){assert.equal(g.winnerId,0);assert.equal(g.turn,0);}
    });
}
