export const isSurface = style => ['donut','mobius','mobius-8x8'].includes(style);
export function referenceProgress(cell,piece) {
    if(piece.type==='P')return piece.owner===0?(piece.pawnDirection===1?cell.y:14-cell.y):(piece.pawnDirection===-1?7-cell.y:(cell.y-7+14)%14);
    const distance=Math.abs(cell.y-(piece.owner===0?0:7));return Math.min(distance,14-distance);
}
const xy=cell=>({x:cell.x??(cell.s===0?cell.f:7-cell.f),y:cell.y??(cell.s===0?cell.r:7-cell.r)});
const at=(t,x,y)=>t.boardStyle==='mobius'?t.gridCell(x,y):y<4?t.getCell(0,y,x):t.getCell(1,7-y,7-x);
export function surfaceStep(style,x,y,dx,dy) {
    if(style==='mobius') {
        let nx=x+dx;const rawY=y+dy;
        const crossings=Math.floor((rawY-11)/14)-Math.floor((y-11)/14),flipped=Math.abs(crossings)%2===1;
        if(flipped){nx=7-nx;dx=-dx;}
        return nx<0 || nx>7?null:{x:nx,y:((rawY%14)+14)%14,dx,dy,flipped,travelFiles:0,travelRanks:rawY-y};
    }
    let nx=x+dx,ny=y+dy,flipped=false;
    while(nx<0 || nx>7) {
        nx=(nx+8)%8;
        if(style==='mobius-8x8'){ny=7-ny;dy=-dy;flipped=!flipped;}
    }
    return ny<0 || ny>7 ? null : {x:nx,y:ny,dx,dy:dy||0,flipped,travelFiles:dx};
}
export function surfaceMoves(game,from,board,attacks=false) {
    const piece=from&&board.get(from.key);if(!piece || piece.frozen)return [];
    const {x,y}=xy(from),t=game.topology,style=game.boardStyle,moves=[];
    const land=(step,extra={})=>{
        if(!step)return false;
        const to=at(t,step.x,step.y),target=board.get(to.key);
        if(attacks || !target || (target.owner!==piece.owner && target.type!=='K'))moves.push({from,to,capture:!!target,travelFiles:step.travelFiles??step.x-x,...(style==='mobius'?{crossedSeam:step.crossedSeam??step.flipped,travelRanks:step.travelRanks}:{}),...extra});
        return !target;
    };
    const step=(dx,dy)=>surfaceStep(style,x,y,dx,dy);
    const ortho=[[1,0],[-1,0],[0,1],[0,-1]],diag=[[1,1],[1,-1],[-1,1],[-1,-1]];
    if(piece.type==='P') {
        const dy=style==='mobius' ? piece.pawnDirection??(piece.owner===0?1:-1) : (piece.owner===0?1:-1)*(piece.pawnTwisted?-1:1);
        const details=s=>style==='mobius'?{pawnDirection:dy,promotion:s.y===(piece.owner===0?7:0)}:{pawnTwisted:!!piece.pawnTwisted!==s.flipped,promotion:s.y===(s.dy===1?7:0)};
        if(attacks){for(const dx of [-1,1])land(step(dx,dy));return moves;}
        const one=step(0,dy);
        if(one && !board.has(at(t,one.x,one.y).key)) {
            land(one,details(one));
            const two=step(0,2*dy);
            const home=style==='mobius'?(piece.owner===0?[1,13]:[6,8]).includes(y):y===(piece.owner===0?1:6);
            if(!piece.moved && home && two && !board.has(at(t,two.x,two.y).key))land(two,style==='mobius'?{pawnDirection:dy,doublePawn:true}:{pawnTwisted:!!piece.pawnTwisted,doublePawn:true});
        }
        for(const dx of [-1,1]) {
            const s=step(dx,dy);if(!s)continue;
            const to=at(t,s.x,s.y),target=board.get(to.key),extra=details(s);
            if(target && target.owner!==piece.owner && target.type!=='K')land(s,extra);
            const ep=game.enPassant,captured=ep&&board.get(ep.pawn);
            if(!target && ep?.target===to.key && ep.owner!==piece.owner && captured?.type==='P' && captured.owner===ep.owner) {
                // The eligible pawn must be beside this pawn in the same local frame.
                const beside=step(dx,0);
                if(beside && at(t,beside.x,beside.y).key===ep.pawn)land(s,{...extra,enPassant:ep.pawn,capture:true});
            }
        }
    } else if(piece.type==='N') {
        for(const [dx,dy] of [[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]])land(step(dx,dy));
    } else if(piece.type==='K') {
        for(const [dx,dy] of [...ortho,...diag])land(step(dx,dy));
        // These experiments retain ordinary home-rank castling, never seam castling.
        if(!attacks && x===4 && y===(piece.owner===0?0:7))for(const side of ['K','Q']) {
            if(!game.castlingRights[piece.owner][side])continue;
            const rook=at(t,side==='K'?7:0,y),p=board.get(rook.key),files=side==='K'?[5,6]:[1,2,3];
            if(p?.type==='R' && p.owner===piece.owner && files.every(f=>!board.has(at(t,f,y).key))) {
                land({x:side==='K'?6:2,y},{castle:side,rookFrom:rook.key,rookTo:at(t,side==='K'?5:3,y).key});
            }
        }
    } else {
        for(const [dx,dy] of piece.type==='R'?ortho:piece.type==='B'?diag:[...ortho,...diag]) {
            let current={x,y,dx,dy};const seen=new Set([from.key]);let crossedSeam=false;
            for(let count=0;count<128;count++) {
                const next=surfaceStep(style,current.x,current.y,current.dx,current.dy);if(!next)break;
                next.travelFiles=dx*(count+1);
                if(style==='mobius'){crossedSeam=crossedSeam||next.flipped||Math.abs(next.y-current.y)>1;next.crossedSeam=crossedSeam;next.travelRanks=dy*(count+1);}
                const key=at(t,next.x,next.y).key;if(seen.has(key))break;seen.add(key);
                if(!land(next))break;current=next;
            }
        }
    }
    return [...new Map(moves.map(move=>[move.to.key,move])).values()];
}
