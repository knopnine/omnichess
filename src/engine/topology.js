import { MASTER_PLAYERS } from './players.js';
import { spaciousGrid, fittedCircle } from './geometry.js';

export const BOARD_STYLES = {
    radial: { label:'Radial', players:null, ranks:4 },
    donut: { label:'Donut', players:2, ranks:4 },
    mobius: { label:'Möbius', players:2, ranks:4 },
    'mobius-8x8': { label:'Möbius · earlier 8×8 experiment', players:2, ranks:4 },
    'three-arm': { label:'Three arms', players:3, ranks:6 },
    cross: { label:'Cross', players:4, ranks:4 },
    'five-arm': { label:'Five-arm', players:5, ranks:6 },
    'six-arm': { label:'Six-arm', players:6, ranks:6 },
};

        export class BoardTopology {
            constructor(numPlayers = 3, boardStyle = 'radial') {
                this.numPlayers = numPlayers;
                const style=BOARD_STYLES[boardStyle];
                this.boardStyle = style && (style.players===null || style.players===numPlayers) ? boardStyle : 'radial';
                this.ranks = BOARD_STYLES[this.boardStyle].ranks;
                this.cells = [];
                this.cellMap = new Map();
                this.outerPolygon = [];
                this.seamLines = [];
                this.homeEdges = [];
                this.rosettePolygon = [];
                this.buildCells();
                this.computeGeometry(1);
            }

            key(s, r, f) {
                if(this.boardStyle==='mobius')return `m_${s===0?r:13-r}_${s===0?f:7-f}`;
                return `${s}_${r}_${f}`;
            }

            getCell(s, r, f) {
                if(this.boardStyle==='mobius')return this.gridCell(s===0?f:7-f,s===0?r:13-r);
                return this.cellMap.get(this.key(s, r, f)) || null;
            }

            buildCells() {
                this.cells = [];
                this.cellMap.clear();
                if(this.boardStyle === 'cross') { this.buildCrossCells(); return; }
                if(this.boardStyle === 'mobius') { this.buildMobiusCells(); return; }
                const N = this.numPlayers;

                for (let s = 0; s < N; s++) {
                    const secCode = MASTER_PLAYERS[s].sectorCode;
                    for (let r = 0; r < this.ranks; r++) {
                        for (let f = 0; f < 8; f++) {
                            const id = s * this.ranks * 8 + r * 8 + f;
                            let colorIndex;
                            if (N === 2) {
                                const globalRow = s === 0 ? r : (7 - r);
                                const globalCol = s === 0 ? f : (7 - f);
                                colorIndex = (globalRow + globalCol) % 2;
                            } else {
                                colorIndex = (s + r + f) % 3;
                            }

                            let coord;
                            if (N === 2) {
                                const globalRank = s === 0 ? (r + 1) : (8 - r);
                                const globalFile = s === 0 ? f : (7 - f);
                                coord = `${String.fromCharCode(97 + globalFile)}${globalRank}`;
                            } else {
                                coord = `${secCode}${f + 1}-${r + 1}`;
                            }

                            const cell = {
                                id, s, r, f,
                                key: this.key(s, r, f),
                                coord,
                                colorIndex,
                                poly: [],
                                center: { x: 0, y: 0 }
                            };
                            this.cells.push(cell);
                            this.cellMap.set(cell.key, cell);
                        }
                    }
                }
            }

            computeGeometry(R) {
                const N = this.numPlayers;
                this.outerPolygon = [];
                this.seamLines = [];
                this.homeEdges = [];
                this.rosettePolygon = [];

                if(this.boardStyle==='donut'){this.computeDonutGeometry(R);return;}
                if(this.boardStyle==='mobius'){this.computeMobiusGeometry(R);return;}
                if(this.boardStyle === 'cross') { this.computeCrossGeometry(R); return; }

                if (this.boardStyle.endsWith('-arm')) {
                    this.computeArmGeometry(R);
                    return;
                }

                if (N === 2) {
                    const halfSide = R * 0.86;
                    this.outerPolygon = [
                        { x: -halfSide, y: halfSide },
                        { x: halfSide,  y: halfSide },
                        { x: halfSide,  y: -halfSide },
                        { x: -halfSide, y: -halfSide }
                    ];
                    this.homeEdges = [
                        { p: 0, p1: { x: -halfSide, y: halfSide }, p2: { x: halfSide, y: halfSide } },
                        { p: 1, p1: { x: halfSide, y: -halfSide }, p2: { x: -halfSide, y: -halfSide } }
                    ];
                    this.seamLines = [
                        { p1: { x: -halfSide, y: 0 }, p2: { x: halfSide, y: 0 } }
                    ];

                    for (const cell of this.cells) {
                        const globalCol = cell.s === 0 ? cell.f : (7 - cell.f);
                        const globalRowFromBottom = cell.s === 0 ? cell.r : (7 - cell.r);

                        const x0 = -halfSide + (globalCol / 8) * (2 * halfSide);
                        const x1 = -halfSide + ((globalCol + 1) / 8) * (2 * halfSide);
                        const y0 = halfSide - (globalRowFromBottom / 8) * (2 * halfSide);
                        const y1 = halfSide - ((globalRowFromBottom + 1) / 8) * (2 * halfSide);

                        cell.poly = [
                            { x: x0, y: y0 },
                            { x: x1, y: y0 },
                            { x: x1, y: y1 },
                            { x: x0, y: y1 }
                        ];
                        cell.center = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
                        cell.fitRadius = (x1 - x0) / 2;
                    }
                    return;
                }

                const deg2rad = Math.PI / 180;
                const dTheta = 180 / N;
                const C = { x: 0, y: 0 };

                for (let k = 0; k < 2 * N; k++) {
                    const ang = (90 + dTheta + k * dTheta) * deg2rad;
                    this.outerPolygon.push({
                        x: R * Math.cos(ang),
                        y: R * Math.sin(ang)
                    });
                }

                for (let s = 0; s < N; s++) {
                    const baseAngle = 90 + s * (360 / N);
                    const aLeftCorner  = (baseAngle + dTheta) * deg2rad;
                    const aRightCorner = (baseAngle - dTheta) * deg2rad;

                    const V_left  = { x: R * Math.cos(aLeftCorner),  y: R * Math.sin(aLeftCorner) };
                    const V_right = { x: R * Math.cos(aRightCorner), y: R * Math.sin(aRightCorner) };

                    const homeAngle = baseAngle * deg2rad;
                    const M_home = { x: R * Math.cos(homeAngle), y: R * Math.sin(homeAngle) };

                    this.homeEdges.push({ p: s, p1: V_left, p2: M_home });
                    this.homeEdges.push({ p: s, p1: M_home, p2: V_right });
                    this.seamLines.push({ p1: C, p2: V_left });

                    const leftGrid = spaciousGrid(V_left,M_home,N);
                    const rightGrid = spaciousGrid(V_right,M_home,N);

                    for (let r = 0; r < 4; r++) {
                        for (let f = 0; f < 8; f++) {
                            const cell = this.getCell(s, r, f);
                            const isRight = f >= 4;
                            const localF = isRight ? (f - 4) : f;

                            const grid = isRight ? rightGrid : leftGrid;
                            const column = isRight ? 4-localF : localF;
                            const nextColumn = isRight ? column-1 : column+1;
                            const p0 = grid[column][r];
                            const p1 = grid[nextColumn][r];
                            const p2 = grid[nextColumn][r+1];
                            const p3 = grid[column][r+1];

                            cell.poly = [p0, p1, p2, p3];
                            const circle = fittedCircle(cell.poly);
                            cell.center = {x:circle.x,y:circle.y};
                            cell.fitRadius = circle.radius;
                        }
                    }
                }
            }

            gridCell(x,y) { return this.gridMap?.get(`${x}_${y}`) || null; }

            buildMobiusCells() {
                this.gridMap=new Map();
                for(let y=0;y<14;y++)for(let x=0;x<8;x++) {
                    const cell={id:y*8+x,s:y<7?0:1,r:y<7?y:13-y,f:y<7?x:7-x,x,y,key:`m_${y}_${x}`,coord:`${String.fromCharCode(97+x)}${y+1}`,colorIndex:(x+y)%2,poly:[],center:{x:0,y:0}};
                    this.cells.push(cell);this.cellMap.set(cell.key,cell);this.gridMap.set(`${x}_${y}`,cell);
                }
            }

            computeMobiusGeometry(R) {
                const unit=R*.9/7,point=(x,y)=>({x:(x-4)*unit,y:(7-y)*unit});
                this.outerPolygon=[[0,0],[8,0],[8,14],[0,14]].map(([x,y])=>point(x,y));
                this.mobiusSeamY=point(0,11).y;
                for(const c of this.cells){c.poly=[[c.x,c.y],[c.x+1,c.y],[c.x+1,c.y+1],[c.x,c.y+1]].map(([x,y])=>point(x,y));c.center=point(c.x+.5,c.y+.5);c.fitRadius=unit/2;}
                this.homeEdges=[{p:0,p1:point(0,0),p2:point(8,0)},{p:1,p1:point(0,7),p2:point(8,7)}];
            }

            computeDonutGeometry(R) {
                const inner=R*.27,width=R*.085;
                const point=(r,a)=>({x:r*Math.cos(a),y:r*Math.sin(a)});
                this.holeRadius=inner;
                this.outerPolygon=Array.from({length:96},(_,i)=>point(inner+8*width,i*Math.PI/48));
                for(const cell of this.cells) {
                    const x=cell.s===0?cell.f:7-cell.f,y=cell.s===0?cell.r:7-cell.r;
                    const a=-Math.PI/2+x*Math.PI/4,b=a+Math.PI/4,r0=inner+y*width,r1=r0+width;
                    cell.poly=[point(r0,a),point(r1,a),point(r1,b),point(r0,b)];
                    cell.renderPoly=[...Array.from({length:9},(_,i)=>point(r1,a+(b-a)*i/8)),...Array.from({length:9},(_,i)=>point(r0,b-(b-a)*i/8))];
                    cell.center=point((r0+r1)/2,(a+b)/2);cell.fitRadius=Math.min(width/2,(r0+r1)/2*Math.sin(Math.PI/8));
                }
            }

            buildCrossCells() {
                this.gridMap=new Map();
                for(let y=0;y<16;y++)for(let x=0;x<16;x++) {
                    if((x<4 || x>11) && (y<4 || y>11))continue;
                    let s,r,f;
                    if(y>11){s=0;r=15-y;f=x-4;}
                    else if(x<4){s=1;r=x;f=y-4;}
                    else if(y<4){s=2;r=y;f=11-x;}
                    else if(x>11){s=3;r=15-x;f=11-y;}
                    else{s=4;r=y-4;f=x-4;}
                    const cell={id:this.cells.length,s,r,f,x,y,key:this.key(s,r,f),coord:s===4?`Hub ${String.fromCharCode(97+f)}${8-r}`:`${MASTER_PLAYERS[s].sectorCode}${f+1}-${r+1}`,colorIndex:(x+y)%2,poly:[],center:{x:0,y:0}};
                    this.cells.push(cell);this.cellMap.set(cell.key,cell);this.gridMap.set(`${x}_${y}`,cell);
                }
            }

            computeCrossGeometry(R) {
                const unit=R*.95/8;
                const point=(x,y)=>({x:(x-8)*unit,y:(y-8)*unit});
                this.outerPolygon=[[4,0],[12,0],[12,4],[16,4],[16,12],[12,12],[12,16],[4,16],[4,12],[0,12],[0,4],[4,4]].map(([x,y])=>point(x,y));
                this.homeEdges=[[[4,16],[12,16]],[[0,4],[0,12]],[[12,0],[4,0]],[[16,12],[16,4]]].map(([a,b],p)=>({p,p1:point(...a),p2:point(...b)}));
                for(const cell of this.cells) {
                    const {x,y}=cell;
                    cell.poly=[[x,y],[x+1,y],[x+1,y+1],[x,y+1]].map(([a,b])=>point(a,b));
                    cell.center=point(x+.5,y+.5);cell.fitRadius=unit/2;
                }
            }

            computeArmGeometry(R) {
                // Square-cell arms surround a shared polygonal field.
                // The center retains the sector seam graph used by multiplayer rules.
                const n=this.numPlayers,apothem=4/Math.tan(Math.PI/n);
                const scale = R / (n===3 ? 7.7 : Math.hypot(4,apothem+4)+.3);
                const rotate = (p,s) => {
                    const a=s*2*Math.PI/n;
                    return {x:scale*(p.x*Math.cos(a)-p.y*Math.sin(a)),y:scale*(p.x*Math.sin(a)+p.y*Math.cos(a)+(n===3?.65:0))};
                };
                const localLeft={x:-4,y:apothem}, localRight={x:4,y:apothem};
                const localGrid=spaciousGrid(localLeft,{x:0,y:apothem},this.boardStyle);
                for(let s=0;s<n;s++) {
                    const left=rotate(localLeft,s), right=rotate(localRight,s), center=rotate({x:0,y:0},s);
                    const backLeft=rotate({x:-4,y:localLeft.y+4},s),backRight=rotate({x:4,y:localLeft.y+4},s);
                    this.outerPolygon.unshift(left,backLeft,backRight,right);
                    this.homeEdges.push({p:s,p1:backLeft,p2:backRight});
                    this.seamLines.push({p1:left,p2:center});
                    for(let r=0;r<6;r++)for(let f=0;f<8;f++) {
                        const cell=this.getCell(s,r,f);
                        if(r<4) {
                            const y=localLeft.y+4-r;
                            cell.poly=[{x:f-4,y},{x:f-3,y},{x:f-3,y:y-1},{x:f-4,y:y-1}].map(p=>rotate(p,s));
                            cell.colorIndex=(r+f)%2;
                        } else {
                            const isRight=f>=4,column=isRight?8-f:f,next=isRight?column-1:column+1,row=r-4;
                            cell.poly=[[column,row],[next,row],[next,row+1],[column,row+1]].map(([i,j])=>{
                                const p=localGrid[i][j];return rotate({x:isRight?-p.x:p.x,y:p.y},s);
                            });
                            cell.colorIndex=(s+r+f)%3;
                        }
                        const circle=fittedCircle(cell.poly);
                        cell.center={x:circle.x,y:circle.y};cell.fitRadius=circle.radius;
                    }
                }
            }

            stepOrthogonal(s, r, f, dr, df) {
                const N = this.numPlayers;
                if (dr !== 0 && df === 0) {
                    const nr = r + dr;
                    if (nr >= 0 && nr < this.ranks) {
                        return { s, r: nr, f, dr, df };
                    }
                    if (nr < 0) return null;

                    if (N === 2) {
                        return { s: (s + 1) % 2, r: 3, f: 7 - f, dr: -1, df: 0 };
                    }

                    if (f < 4) {
                        return { s: (s + 1) % N, r: this.ranks-1, f: 7 - f, dr: -1, df: 0 };
                    } else {
                        return { s: (s + N - 1) % N, r: this.ranks-1, f: 7 - f, dr: -1, df: 0 };
                    }
                }

                if (df !== 0 && dr === 0) {
                    const nf = f + df;
                    if (nf >= 0 && nf <= 7) {
                        return { s, r, f: nf, dr, df };
                    }
                    return null;
                }

                return null;
            }

            stepDiagonal(s, r, f, dr, df) {
                const N = this.numPlayers;
                const nr = r + dr;
                const nf = f + df;

                if (nr >= 0 && nr < this.ranks && nf >= 0 && nf <= 7) {
                    return [{ s, r: nr, f: nf, dr, df }];
                }

                if (nr < 0 || nf < 0 || nf > 7) {
                    return [];
                }

                if (nr === this.ranks) {
                    if (N === 2) {
                        return [{
                            s: (s + 1) % 2,
                            r: 3,
                            f: 7 - nf,
                            dr: -1,
                            df: -df
                        }];
                    }

                    const results = [];
                    if ((f === 3 && df === 1) || (f === 4 && df === -1)) {
                        for (let targetS = 0; targetS < N; targetS++) {
                            if (targetS === s) continue;
                            results.push({
                                s: targetS,
                                r: this.ranks-1,
                                f: f === 3 ? 3 : 4,
                                dr: -1,
                                df: f === 3 ? -1 : 1
                            });
                        }
                        return results;
                    }

                    if (f < 4 && nf >= 0 && nf <= 3) {
                        results.push({
                            s: (s + 1) % N,
                            r: this.ranks-1,
                            f: 7 - nf,
                            dr: -1,
                            df: -df
                        });
                    } else if (f >= 4 && nf >= 4 && nf <= 7) {
                        results.push({
                            s: (s + N - 1) % N,
                            r: this.ranks-1,
                            f: 7 - nf,
                            dr: -1,
                            df: -df
                        });
                    }

                    return results;
                }

                return [];
            }

            getKnightTargets(s, r, f) {
                const targets = new Map();
                const orthoDirs = [
                    { dr: 1, df: 0 },
                    { dr: -1, df: 0 },
                    { dr: 0, df: 1 },
                    { dr: 0, df: -1 }
                ];

                for (const d1 of orthoDirs) {
                    const s1 = this.stepOrthogonal(s, r, f, d1.dr, d1.df);
                    if (!s1) continue;
                    const s2 = this.stepOrthogonal(s1.s, s1.r, s1.f, s1.dr, s1.df);
                    if (s2) {
                        const perpDirs = s2.dr !== 0
                            ? [{ dr: 0, df: 1 }, { dr: 0, df: -1 }]
                            : [{ dr: 1, df: 0 }, { dr: -1, df: 0 }];
                        for (const p of perpDirs) {
                            const s3 = this.stepOrthogonal(s2.s, s2.r, s2.f, p.dr, p.df);
                            if (s3) {
                                const cell = this.getCell(s3.s, s3.r, s3.f);
                                if (cell) targets.set(cell.key, cell);
                            }
                        }
                    }

                    const perpDirs1 = s1.dr !== 0
                        ? [{ dr: 0, df: 1 }, { dr: 0, df: -1 }]
                        : [{ dr: 1, df: 0 }, { dr: -1, df: 0 }];
                    for (const p of perpDirs1) {
                        const p1 = this.stepOrthogonal(s1.s, s1.r, s1.f, p.dr, p.df);
                        if (!p1) continue;
                        const p2 = this.stepOrthogonal(p1.s, p1.r, p1.f, p1.dr, p1.df);
                        if (p2) {
                            const cell = this.getCell(p2.s, p2.r, p2.f);
                            if (cell) targets.set(cell.key, cell);
                        }
                    }
                }

                return Array.from(targets.values());
            }
        }

