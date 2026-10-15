import boardGrids from './board-grids.json' with { type: 'json' };

export function spaciousGrid(corner,home,variant) {
    return boardGrids[variant].map(column=>column.map(([u,v])=>({x:corner.x*u+home.x*v,y:corner.y*u+home.y*v})));
}

export const uniformPieceFit = topology => Math.min(...topology.cells.map(cell=>cell.fitRadius))*.98;

function determinant(a) {
    return a[0][0]*(a[1][1]*a[2][2]-a[1][2]*a[2][1])
        - a[0][1]*(a[1][0]*a[2][2]-a[1][2]*a[2][0])
        + a[0][2]*(a[1][0]*a[2][1]-a[1][1]*a[2][0]);
}

// Maximize an inscribed circle against the convex cell's edge half-planes.
// This keeps circles inside skewed cells instead of relying on edge length.
export function fittedCircle(poly) {
    const signedArea = poly.reduce((sum,a,i) => { const b=poly[(i+1)%poly.length]; return sum+a.x*b.y-b.x*a.y; },0);
    const orientation = signedArea>=0 ? 1 : -1;
    const edges = poly.map((a,i) => {
        const b=poly[(i+1)%poly.length],length=Math.hypot(b.x-a.x,b.y-a.y);
        if (length<1e-10) return null;
        const nx=orientation*(b.y-a.y)/length,ny=-orientation*(b.x-a.x)/length;
        return {nx,ny,d:nx*a.x+ny*a.y};
    }).filter(Boolean);
    const center = {x:poly.reduce((sum,p)=>sum+p.x,0)/poly.length,y:poly.reduce((sum,p)=>sum+p.y,0)/poly.length};
    let best = {...center,radius:Math.max(0,Math.min(...edges.map(e=>e.d-e.nx*center.x-e.ny*center.y)))};
    for (let i=0;i<edges.length;i++) for (let j=i+1;j<edges.length;j++) for (let k=j+1;k<edges.length;k++) {
        const selected=[edges[i],edges[j],edges[k]],matrix=selected.map(e=>[e.nx,e.ny,1]),denominator=determinant(matrix);
        if (Math.abs(denominator)<1e-10) continue;
        const answer=[0,1,2].map(column => determinant(matrix.map((row,r)=>row.map((value,c)=>c===column?selected[r].d:value)))/denominator);
        const [x,y,radius]=answer;
        if (radius>best.radius && edges.every(e=>e.nx*x+e.ny*y+radius<=e.d+1e-7)) best={x,y,radius};
    }
    return best;
}
