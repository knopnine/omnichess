import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/engine/game.js';
import { FakeClock, fixture, move } from './helpers.js';

function running() {
    const clock=new FakeClock();
    const game=new Game({clock,seatsIsAI:[true,true,true,true,true,true]});
    game.enterArena(); game.togglePause(); return {game,clock};
}
test('at most one AI timer and stale callbacks cannot modify a new game',()=>{
    const {game:g,clock}=running(); const stale=[...clock.tasks.values()][0].fn;
    g.scheduleNextTurnIfNeeded();assert.equal(clock.tasks.size,1);g.newGame();stale();assert.equal(g.plyCount,0);assert.equal(clock.tasks.size,1);g.cancelAI();
});
test('pause and resume cancel and schedule AI',()=>{const {game:g,clock}=running();g.togglePause();assert.equal(clock.tasks.size,0);clock.run();assert.equal(g.plyCount,0);g.togglePause();assert.equal(clock.tasks.size,1);g.cancelAI();});
test('nested modal suspensions preserve running state',()=>{const {game:g,clock}=running();g.suspend('settings');g.suspend('confirm');assert.equal(clock.tasks.size,0);assert.equal(g.isPaused,false);g.unsuspend('settings');assert.equal(clock.tasks.size,0);g.unsuspend('confirm');assert.equal(clock.tasks.size,1);g.cancelAI();});
test('modal closure does not resume a previously paused game',()=>{const {game:g,clock}=running();g.togglePause();g.suspend('settings');g.unsuspend('settings');assert.equal(clock.tasks.size,0);});
test('step commits exactly one move and stays paused',()=>{const {game:g,clock}=running();g.stepAI();assert.equal(g.plyCount,1);assert.equal(g.isPaused,true);assert.equal(clock.tasks.size,0);});
test('speed change reschedules with the selected delay',()=>{const {game:g,clock}=running();const stale=[...clock.tasks.values()][0].fn;g.setSpeed(900);assert.equal(clock.tasks.size,1);assert.equal([...clock.tasks.values()][0].ms,900);stale();assert.equal(g.plyCount,0);g.cancelAI();});
test('navigation pauses and cancels AI; returning stays paused',()=>{const {game:g,clock}=running();g.leaveArena();assert.equal(clock.tasks.size,0);g.enterArena();assert.equal(g.isPaused,true);assert.equal(clock.tasks.size,0);});
test('human undo removes their move and AI replies, preserving settings',()=>{
    const clock=new FakeClock(),g=new Game({numPlayers:2,clock});g.enterArena();g.isPaused=false;
    move(g,'e2','e4');g.performAIMove(1);assert.equal(g.plyCount,2);
    g.difficulty='casual';g.aiDelay=900;g.convertOnKingKill=false;g.undoMove();
    assert.equal(g.plyCount,0);assert.equal(g.turn,0);assert.equal(g.difficulty,'casual');assert.equal(g.aiDelay,900);assert.equal(g.convertOnKingKill,false);assert.equal(g.canUndo(),false);g.cancelAI();
});
test('undo preserves pause and current controllers',()=>{
    const g=new Game({numPlayers:2});move(g,'e2','e4');g.seatsIsAI[0]=true;g.seatsIsAI[1]=false;g.isPaused=true;g.undoMove();
    assert.equal(g.seatsIsAI[0],true);assert.equal(g.isPaused,true);
});
test('spectator undo removes one ply and stays paused',()=>{const {game:g,clock}=running();g.stepAI();g.stepAI();g.undoMove();assert.equal(g.plyCount,1);assert.equal(g.isPaused,true);assert.equal(clock.tasks.size,0);});
test('controller changes cancel stale callbacks',()=>{const {game:g,clock}=running();const stale=[...clock.tasks.values()][0].fn;g.toggleSeatController(0);stale();assert.equal(g.plyCount,0);assert.equal(clock.tasks.size,0);});
test('multiplayer direct king capture ends first-checkmate immediately',()=>{
    const g=fixture(3,{'A5-1':['K',0],'B5-1':['K',1],'C5-1':['K',2],'B5-3':['R',0]});g.victoryMode='first_checkmate';
    move(g,'B5-3','B5-1');assert.equal(g.result.type,'win');assert.equal(g.result.winner,0);assert.equal(g.turn,0);assert.equal(g.plyCount,1);
});
for(let n=3;n<=6;n++) test(`${n}-player seam and diagonal branching preserved`,()=>{
    const g=new Game({numPlayers:n});const step=g.topology.stepOrthogonal(0,3,2,1,0);assert.deepEqual(step,{s:1,r:3,f:5,dr:-1,df:0});
    assert.equal(g.topology.stepDiagonal(0,3,3,1,1).length,n-1);
});
