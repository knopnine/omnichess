import test from 'node:test';
import assert from 'node:assert/strict';
import { BoardTopology } from '../src/engine/topology.js';
const area = poly => Math.abs(poly.reduce((sum,p,i) => {const q=poly[(i+1)%poly.length];return sum+p.x*q.y-q.x*p.y;},0))/2;
for(let n=2;n<=6;n++) test(`${n}-player cells cover the entire polygon without empty wedges`,()=>{
    const t=new BoardTopology(n);t.computeGeometry(100);
    assert.ok(Math.abs(t.cells.reduce((sum,c)=>sum+area(c.poly),0)-area(t.outerPolygon))<1e-6);
    assert.ok(t.cells.every(c=>area(c.poly)>0));
    if(n>2)assert.equal(t.cells.filter(c=>c.poly.some(p=>Math.hypot(p.x,p.y)<1e-6)).length,2*n);
});

const signedArea=poly=>poly.reduce((sum,p,i)=>{const q=poly[(i+1)%poly.length];return sum+p.x*q.y-q.x*p.y;},0);
for(let n=2;n<=6;n++) test(`${n}-player cells remain convex and contain their fitted piece circles`,()=>{
    const t=new BoardTopology(n);t.computeGeometry(300);
    for(const cell of t.cells){
        const sign=Math.sign(signedArea(cell.poly));
        assert.ok(cell.fitRadius>0 && Number.isFinite(cell.fitRadius));
        for(let i=0;i<4;i++){
            const a=cell.poly[i],b=cell.poly[(i+1)%4],c=cell.poly[(i+2)%4];
            const cross=(b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x);
            assert.ok(sign*cross>=-1e-6,`${cell.coord} is convex`);
            const length=Math.hypot(b.x-a.x,b.y-a.y);
            const distance=sign*((b.x-a.x)*(cell.center.y-a.y)-(b.y-a.y)*(cell.center.x-a.x))/length;
            assert.ok(distance>=cell.fitRadius-1e-6,`${cell.coord} contains the fitted circle`);
        }
    }
});
for(let n=4;n<=6;n++) test(`${n}-player seam destinations share the same physical cell edge`,()=>{
    const t=new BoardTopology(n);t.computeGeometry(300);
    for(let s=0;s<n;s++)for(let f=0;f<8;f++){
        const source=t.getCell(s,3,f),step=t.stepOrthogonal(s,3,f,1,0),target=t.getCell(step.s,step.r,step.f);
        const sourceEdge=source.poly.slice(2),targetEdge=target.poly.slice(2);
        for(const p of sourceEdge)assert.ok(targetEdge.some(q=>Math.hypot(p.x-q.x,p.y-q.y)<1e-6));
    }
});
test('redistributed grids enlarge the narrowest cells on every tapered board',()=>{
    for(const [n,style,minimum] of [[3,'radial',18],[4,'radial',16],[5,'radial',14],[6,'radial',12],[3,'three-arm',7]]) {
        const t=new BoardTopology(n,style);t.computeGeometry(300);
        assert.ok(Math.min(...t.cells.map(c=>c.fitRadius))>minimum,`${n} ${style}`);
    }
});
