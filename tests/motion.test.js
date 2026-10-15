import test from 'node:test';
import assert from 'node:assert/strict';
import { MoveAnimation, movementPose } from '../src/ui/motion.js';
import { fixture,move,cell,FakeClock } from './helpers.js';
import { Game } from '../src/engine/game.js';
import { BoardView } from '../src/ui/board.js';

function animator(reduced=false) {
    let time=0,id=0,finishes=0,draws=0;
    const frames=new Map();
    const motion=new MoveAnimation({now:()=>time,requestFrame:fn=>{frames.set(++id,fn);return id;},cancelFrame:key=>frames.delete(key),onFrame:()=>draws++,onFinish:()=>finishes++,reducedMotion:()=>reduced});
    return {motion,frames,at(ms){time=ms;const [key,fn]=frames.entries().next().value||[];if(fn){frames.delete(key);fn();}},get finishes(){return finishes;},get draws(){return draws;}};
}
test('moving piece interpolates position while preserving the shared piece size',()=>{
    const a={center:{x:0,y:10},fitRadius:5},b={center:{x:100,y:30},fitRadius:10};
    assert.deepEqual(movementPose(a,b,0),{x:0,y:10,fitRadius:5});
    assert.deepEqual(movementPose(a,b,1),{x:100,y:30,fitRadius:5});
    const midpoint=movementPose(a,b,.5,7);assert.ok(midpoint.x>0&&midpoint.x<100);assert.equal(midpoint.fitRadius,7);
});
test('animation completes once and releases all scheduled frames',()=>{
    const a=animator();assert.equal(a.motion.start({ply:1},200),true);a.at(100);assert.equal(a.motion.active.progress,.5);a.at(200);assert.equal(a.motion.active,null);assert.equal(a.finishes,1);assert.equal(a.frames.size,0);
});
test('cancelled animation ignores stale frame callbacks',()=>{
    const a=animator();a.motion.start({ply:1},200);const stale=[...a.frames.values()][0];a.motion.cancel();stale();assert.equal(a.finishes,1);assert.equal(a.motion.active,null);assert.equal(a.frames.size,0);
});
test('replacing a motion cancels the previous one safely',()=>{
    const a=animator();a.motion.start({ply:1},200);const stale=[...a.frames.values()][0];a.motion.start({ply:2},200);stale();assert.equal(a.motion.active.data.ply,2);assert.equal(a.finishes,1);a.at(200);assert.equal(a.finishes,2);
});
test('reduced motion schedules no frames or artificial suspension',()=>{
    const a=animator(true);assert.equal(a.motion.start({ply:1},200),false);assert.equal(a.frames.size,0);assert.equal(a.finishes,0);assert.equal(a.draws,0);
});
test('capture move reports original piece and captured square',()=>{
    const g=fixture(2,{e1:['K',0],e8:['K',1],a1:['R',0],a7:['P',1]});let event;g.onMove=value=>event=value;
    move(g,'a1','a7');assert.equal(event.ply,1);assert.equal(event.pieces[0].piece.type,'R');assert.equal(event.captured.key,cell(g,'a7').key);assert.equal(event.captured.piece.type,'P');
});
test('en passant reports the side pawn and promotion travels as a pawn',()=>{
    const g=fixture(2,{e1:['K',0],e8:['K',1],e5:['P',0],d7:['P',1]});let event;g.turn=1;g.onMove=value=>event=value;
    move(g,'d7','d5');move(g,'e5','d6');assert.equal(event.captured.key,cell(g,'d5').key);
    const h=fixture(2,{e1:['K',0],h8:['K',1],a7:['P',0],h7:['R',1]});h.onMove=value=>event=value;move(h,'a7','a8','N');assert.equal(event.pieces[0].piece.type,'P');assert.equal(h.board.get(cell(h,'a8').key).type,'N');
});
test('castling emits both king and rook travel',()=>{
    const g=fixture(2,{e1:['K',0],e8:['K',1],h1:['R',0]});g.castlingRights[0].K=true;let event;g.onMove=value=>event=value;
    move(g,'e1','g1');assert.equal(event.pieces.length,2);assert.equal(event.pieces[1].from,cell(g,'h1').key);assert.equal(event.pieces[1].to,cell(g,'f1').key);
});
test('AI scheduling waits for piece movement to finish',()=>{
    const clock=new FakeClock(),g=new Game({numPlayers:2,clock});g.enterArena();g.isPaused=false;
    g.onMove=()=>g.suspend('piece-movement');move(g,'e2','e4');assert.equal(clock.tasks.size,0);g.unsuspend('piece-movement');assert.equal(clock.tasks.size,1);g.cancelAI();
});
test('cancellation during repaint does not leave a pending frame',()=>{
    const a=animator();a.motion.start({ply:1},200);a.motion.onFrame=()=>a.motion.cancel();a.at(100);
    assert.equal(a.motion.active,null);assert.equal(a.frames.size,0);assert.equal(a.finishes,1);
});
test('board animation is cancelled by undo and reset without leaving AI suspended',()=>{
    const old={window:globalThis.window,document:globalThis.document,ResizeObserver:globalThis.ResizeObserver,Path2D:globalThis.Path2D};
    const frames=new Map();let id=0;
    Object.assign(globalThis,{window:{devicePixelRatio:1,matchMedia:()=>({matches:false}),requestAnimationFrame:fn=>{frames.set(++id,fn);return id;},cancelAnimationFrame:key=>frames.delete(key)},document:{activeElement:null},ResizeObserver:class{observe(){}disconnect(){}},Path2D:class{}});
    try{
        const ctx=new Proxy({},{get:(target,key)=>target[key]??(()=>{})});
        const canvas={clientWidth:500,getContext:()=>ctx,addEventListener(){},setAttribute(){}};
        const g=new Game({numPlayers:2,clock:new FakeClock()});g.enterArena();
        const view=new BoardView(canvas,g,{interactive:true});g.onChange=()=>view.draw();g.onMove=event=>view.animateMove(event);
        move(g,'e2','e4');assert.equal(view.isAnimating,true);assert.equal(g.suspensions.has('piece-movement'),true);
        g.undoMove();assert.equal(view.isAnimating,false);assert.equal(g.suspensions.has('piece-movement'),false);assert.equal(frames.size,0);
        move(g,'e2','e4');g.newGame();assert.equal(view.isAnimating,false);assert.equal(g.suspensions.size,0);assert.equal(frames.size,0);view.destroy();
    }finally{Object.assign(globalThis,old);}
});
