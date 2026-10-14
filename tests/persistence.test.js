import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/engine/game.js';
import { Persistence, SAVE_KEY, serializeGame, validateSave, restoreGame } from '../src/engine/persistence.js';
import { cell, move, fixture } from './helpers.js';

test('round trip preserves position, metadata, and undo after restore',()=>{
    const g=new Game({numPlayers:2});move(g,'e2','e4');move(g,'g8','f6','Q',false);
    const data=JSON.parse(JSON.stringify(serializeGame(g)));assert.equal(validateSave(data),true);
    const restored=new Game();restoreGame(restored,data);assert.deepEqual(restored.snapshot(),g.snapshot());assert.equal(restored.isPaused,true);assert.equal(restored.inArena,false);
    assert.equal(restored.lastMoves[0].from,restored.topology.cellMap.get(cell(restored,'e2').key));restored.undoMove();assert.equal(restored.plyCount,0);
});
test('pending promotion saves the preceding committed position',()=>{
    const g=fixture(2,{e1:['K',0],h8:['K',1],a7:['P',0]});g.selectCell(cell(g,'a7'));g.selectCell(cell(g,'a8'));assert.ok(g.pendingPromotion);
    const data=serializeGame(g);assert.equal(validateSave(data),true);const restored=new Game();restoreGame(restored,data);assert.equal(restored.pendingPromotion,null);assert.equal(restored.board.get(cell(restored,'a7').key).type,'P');
});
test('all player counts can be saved and restored',()=>{for(let n=2;n<=6;n++){const g=new Game({numPlayers:n});const data=serializeGame(g);assert.equal(validateSave(data),true);const h=new Game();restoreGame(h,data);assert.equal(h.board.size,n*16);assert.equal(h.numPlayers,n);}});
test('result saves preserve draws and wins',()=>{const g=new Game({numPlayers:2});for(const result of [{type:'draw',reason:'Stalemate'},{type:'win',winner:1,reason:'Checkmate'}]){g.finish(result);const h=new Game();restoreGame(h,serializeGame(g));assert.deepEqual(h.result,result);}});
test('unsupported, corrupt, and invalid saves remain untouched',()=>{
    for(const raw of ['{invalid',JSON.stringify({...serializeGame(new Game()),version:2}),JSON.stringify({version:1})]){
        let value=raw,writes=0;const warnings=[];const store={getItem:()=>value,setItem(k,v){writes++;value=v;}};
        const p=new Persistence(store,m=>warnings.push(m));assert.equal(p.read(),null);assert.equal(p.save(new Game()),false);assert.equal(writes,0);assert.equal(value,raw);assert.equal(warnings.length,1);
    }
});
test('invalid coordinates, owners, and duplicated squares are rejected',()=>{
    for(const corrupt of [d=>d.state.board[0][0]='bad',d=>d.state.board[0][1].owner=99,d=>d.state.board.push(d.state.board[0]),d=>d.options.aiDelay=-1,d=>d.state.turn=99,d=>d.state.result={type:'win',winner:99,reason:'bad'}]){const d=structuredClone(serializeGame(new Game()));corrupt(d);assert.equal(validateSave(d),false);}
});
test('storage errors are nonblocking and warn once',()=>{
    const warnings=[],p=new Persistence({getItem:()=>null,setItem(){throw new Error('Quota');}},m=>warnings.push(m));p.read();const g=new Game();assert.equal(p.save(g),false);assert.equal(p.save(g),false);assert.equal(warnings.length,1);assert.equal(g.board.size,48);
});
test('blocked storage access does not crash loading',()=>{const p=new Persistence({getItem(){throw new Error('Blocked');}},()=>{});assert.equal(p.read(),null);});
test('save slot uses expected key and serialized schema',()=>{let key,value;const p=new Persistence({getItem:()=>null,setItem(k,v){key=k;value=v;}});p.save(new Game());assert.equal(key,SAVE_KEY);assert.equal(validateSave(JSON.parse(value)),true);});
