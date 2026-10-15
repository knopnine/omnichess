import test from 'node:test';
import assert from 'node:assert/strict';
import { BoardTopology } from '../src/engine/topology.js';
import { uniformPieceFit } from '../src/engine/geometry.js';
import { BoardView } from '../src/ui/board.js';
import { Game } from '../src/engine/game.js';
const variants=[[2,'radial'],[2,'donut'],[2,'mobius'],[3,'radial'],[4,'radial'],[5,'radial'],[6,'radial'],[3,'three-arm'],[4,'cross'],[5,'five-arm'],[6,'six-arm']];

for(const [n,style] of variants)test(`${n} ${style}: one piece size including rings fits every cell without overlap`,()=>{
    const topology=new BoardTopology(n,style);topology.computeGeometry(300);
    const fit=uniformPieceFit(topology),outerRadius=fit*.8+Math.min(4,fit*.22)/2;
    for(const c of topology.cells)assert.ok(outerRadius<c.fitRadius,`${c.coord} contains the piece and its ring`);
    for(let i=0;i<topology.cells.length;i++)for(let j=i+1;j<topology.cells.length;j++){
        const a=topology.cells[i].center,b=topology.cells[j].center;
        assert.ok(Math.hypot(a.x-b.x,a.y-b.y)>2*outerRadius,`${i} and ${j} do not overlap`);
    }
    topology.computeGeometry(150);assert.ok(Math.abs(uniformPieceFit(topology)-fit/2)<1e-6);
});

test('stationary, captured and moving pieces share one size, including after resizing',()=>{
    const old={window:globalThis.window,document:globalThis.document,ResizeObserver:globalThis.ResizeObserver,Path2D:globalThis.Path2D};
    Object.assign(globalThis,{window:{devicePixelRatio:1,requestAnimationFrame:()=>1,cancelAnimationFrame(){},matchMedia:()=>({matches:false})},document:{activeElement:null},ResizeObserver:class{observe(){}disconnect(){}},Path2D:class{}});
    try {
        for(const [n,style] of variants){
            const ctx=new Proxy({},{get:(target,key)=>target[key]??(()=>{})});
            const canvas={clientWidth:700,getContext:()=>ctx,addEventListener(){},setAttribute(){}};
            const g=new Game({numPlayers:n,boardStyle:style});g.enterArena();
            const view=new BoardView(canvas,g,{interactive:true}),sizes=[];
            view.drawPiece=(_ctx,_point,_piece,fit)=>sizes.push(fit);
            view.draw();
            const cells=g.topology.cells.slice().sort((a,b)=>a.fitRadius-b.fitRadius),from=cells.at(-1),to=cells[0];
            view.motion.start({ply:g.plyCount,topology:g.topology,pieces:[{from:from.key,to:to.key,piece:{owner:0,type:'R'}}],captured:{key:to.key,piece:{owner:1,type:'P'}}},200);
            for(const progress of [0,.5,1]){
                sizes.length=0;view.motion.active.progress=progress;view.draw();
                assert.ok(sizes.length>1);assert.ok(sizes.every(size=>size===uniformPieceFit(g.topology)));
            }
            const before=sizes[0];sizes.length=0;canvas.clientWidth=350;view.draw();
            assert.ok(sizes.every(size=>Math.abs(size-before/2)<1e-6));view.destroy();
        }
    } finally { Object.assign(globalThis,old); }
});
