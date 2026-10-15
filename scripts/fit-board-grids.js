// Offline geometry fitting; production reads the generated normalized vertices.
import { writeFileSync } from 'node:fs';
import { fittedCircle } from '../src/engine/geometry.js';
const blend=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
const results={};
for(const n of [3,4,5,6,'three-arm','five-arm','six-arm']) {
    const armed=typeof n==='string',players={'three-arm':3,'five-arm':5,'six-arm':6}[n];
    const rows=armed?2:4;
    const corner=armed?{x:-4,y:4/Math.tan(Math.PI/players)}:{x:-Math.sin(Math.PI/n),y:Math.cos(Math.PI/n)};
    const home=armed?{x:0,y:corner.y}:{x:0,y:1};
    const zero={x:0,y:0};
    const params=[.5,...[1,2,3].map(i=>i/4),...Array.from({length:rows-1},(_,i)=>(i+1)/rows),...[1,2,3].map(i=>i/4),...Array.from({length:rows-1},(_,i)=>(i+1)/rows)];
    const offset=params.length;
    const seam=blend(zero,corner,.5);
    for(let i=1;i<4;i++)for(let j=1;j<rows;j++){
        const p=blend(blend(corner,home,i/4),blend(seam,zero,i/4),j/rows);params.push(p.x,p.y);
    }
    function grid(p) {
        let at=1;
        const g=Array.from({length:5},()=>Array(rows+1));
        g[0][0]=corner;g[4][0]=home;g[0][rows]=blend(zero,corner,p[0]);g[4][rows]=zero;
        const edge=(count,fn)=>{let last=0;for(let i=1;i<count;i++){const t=p[at++];if(t<=last+.025 || t>=.975)return false;fn(i,t);last=t;}return true;};
        if(p[0]<.15 || p[0]>.85)return null;
        if(!edge(4,(i,t)=>g[i][0]=blend(corner,home,t)))return null;
        if(!edge(rows,(j,t)=>g[0][j]=blend(corner,g[0][rows],t)))return null;
        if(!edge(4,(i,t)=>g[i][rows]=blend(g[0][rows],zero,t)))return null;
        if(!edge(rows,(j,t)=>g[4][j]=blend(home,zero,t)))return null;
        for(let i=1;i<4;i++)for(let j=1;j<rows;j++)g[i][j]={x:p[at++],y:p[at++]};
        return g;
    }
    function score(p) {
        const g=grid(p);if(!g)return Infinity;
        let total=0;
        for(let i=0;i<4;i++)for(let j=0;j<rows;j++){
            const poly=[g[i][j],g[i+1][j],g[i+1][j+1],g[i][j+1]];
            for(let k=0;k<4;k++){
                const a=poly[k],b=poly[(k+1)%4],c=poly[(k+2)%4];
                if((b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x)>1e-9)return Infinity;
            }
            const r=fittedCircle(poly).radius;
            if(r<1e-8)return Infinity;
            total+=(Math.abs(corner.x)/r)**12;
        }
        return total;
    }
    let best=score(params);
    for(let step=.04;step>.00005;step*=.6)for(let pass=0;pass<90;pass++){
        let changed=false;
        for(let i=0;i<params.length;i++) {
            if(armed && i>=1 && i<=3)continue;
            const initial=params[i],delta=step*(i<offset?1:Math.abs(corner.x));
            let chosen=initial;
            for(const direction of [-1,1]){
                params[i]=initial+delta*direction;const next=score(params);
                if(next<best){best=next;chosen=params[i];changed=true;}
            }
            params[i]=chosen;
        }
        if(!changed)break;
    }
    const g=grid(params);
    results[n]=g.map(column=>column.map(p=>{
        const u=p.x/corner.x,v=(p.y-u*corner.y)/home.y;
        return [Number(u.toFixed(10)),Number(v.toFixed(10))];
    }));
    console.log('Fitted',n,'score',best.toExponential(3));
}
writeFileSync(new URL('../src/engine/board-grids.json',import.meta.url),JSON.stringify(results));
