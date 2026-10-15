const forwards = [[0,-1],[1,0],[0,1],[-1,0]];
const orthogonal = [[1,0],[-1,0],[0,1],[0,-1]];
const diagonal = [[1,1],[1,-1],[-1,1],[-1,-1]];
export const crossPawnProgress=(cell,owner)=>[15-cell.y,cell.x,cell.y,15-cell.x][owner];

export function crossPawnTargets(topology,cell,owner) {
    const [dx,dy]=forwards[owner];
    return [-1,1].map(side=>topology.gridCell(cell.x+dx+dy*side,cell.y+dy+dx*side)).filter(Boolean);
}

// Cross-board pieces use one shared square grid, with the four corner areas absent.
export function crossMoves(game,from,board,attacks=false) {
    const p=board.get(from.key);
    if(!p || p.frozen)return [];
    const t=game.topology,moves=[];
    const land=(to,extra={})=>{
        if(!to)return false;
        const target=board.get(to.key);
        if(attacks || !target || (target.owner!==p.owner && !target.frozen))moves.push({from,to,capture:!!target,...extra});
        return !target;
    };
    const promotes=to=>p.owner===0?to.y===0:p.owner===1?to.x===15:p.owner===2?to.y===15:to.x===0;
    if(p.type==='P') {
        if(attacks)return crossPawnTargets(t,from,p.owner).map(to=>({from,to,capture:board.has(to.key)}));
        const [dx,dy]=forwards[p.owner],one=t.gridCell(from.x+dx,from.y+dy);
        if(one && !board.has(one.key)) {
            land(one,{promotion:promotes(one)});
            const two=t.gridCell(from.x+2*dx,from.y+2*dy);
            if(!p.moved && from.s===p.owner && from.r===1 && two && !board.has(two.key))land(two);
        }
        for(const to of crossPawnTargets(t,from,p.owner)) {
            const target=board.get(to.key);
            if(target && target.owner!==p.owner && !target.frozen)land(to,{promotion:promotes(to)});
        }
    } else if(p.type==='N') {
        for(const [dx,dy] of [[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]])land(t.gridCell(from.x+dx,from.y+dy));
    } else if(p.type==='K') {
        for(const [dx,dy] of [...orthogonal,...diagonal])land(t.gridCell(from.x+dx,from.y+dy));
        if(!attacks && !p.moved && from.s===p.owner && from.r===0 && from.f===4) {
            for(const side of ['K','Q']) {
                const rook=t.getCell(p.owner,0,side==='K'?7:0),piece=board.get(rook.key);
                const files=side==='K'?[5,6]:[1,2,3];
                if(piece?.type==='R' && piece.owner===p.owner && !piece.moved && !piece.frozen && files.every(f=>!board.has(t.key(p.owner,0,f)))) {
                    land(t.getCell(p.owner,0,side==='K'?6:2),{castle:side});
                }
            }
        }
    } else {
        const directions=p.type==='R'?orthogonal:p.type==='B'?diagonal:[...orthogonal,...diagonal];
        for(const [dx,dy] of directions)for(let step=1;step<16;step++) {
            if(!land(t.gridCell(from.x+step*dx,from.y+step*dy)))break;
        }
    }
    return moves;
}
