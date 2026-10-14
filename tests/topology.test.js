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
