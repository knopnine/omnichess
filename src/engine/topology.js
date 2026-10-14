import { MASTER_PLAYERS } from './players.js';
        function lerpPt(A, B, t) {
            return { x: A.x + (B.x - A.x) * t, y: A.y + (B.y - A.y) * t };
        }
        function bilerp(P00, P10, P01, P11, u, v) {
            const bottom = lerpPt(P00, P10, u);
            const top = lerpPt(P01, P11, u);
            return lerpPt(bottom, top, v);
        }

        export class BoardTopology {
            constructor(numPlayers = 3) {
                this.numPlayers = numPlayers;
                this.cells = [];
                this.cellMap = new Map();
                this.outerPolygon = [];
                this.seamLines = [];
                this.homeEdges = [];
                this.buildCells();
                this.computeGeometry(1);
            }

            key(s, r, f) {
                return `${s}_${r}_${f}`;
            }

            getCell(s, r, f) {
                return this.cellMap.get(this.key(s, r, f)) || null;
            }

            buildCells() {
                this.cells = [];
                this.cellMap.clear();
                const N = this.numPlayers;

                for (let s = 0; s < N; s++) {
                    const secCode = MASTER_PLAYERS[s].sectorCode;
                    for (let r = 0; r < 4; r++) {
                        for (let f = 0; f < 8; f++) {
                            const id = s * 32 + r * 8 + f;
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
                    const M_left = lerpPt(C, V_left, 0.5);
                    const M_right = lerpPt(C, V_right, 0.5);

                    this.homeEdges.push({ p: s, p1: V_left, p2: M_home });
                    this.homeEdges.push({ p: s, p1: M_home, p2: V_right });
                    this.seamLines.push({ p1: C, p2: V_left });

                    const leftQuad  = { P00: V_left, P10: M_home, P01: M_left, P11: C };
                    const rightQuad = { P00: M_home, P10: V_right, P01: C,     P11: M_right };

                    for (let r = 0; r < 4; r++) {
                        for (let f = 0; f < 8; f++) {
                            const cell = this.getCell(s, r, f);
                            const isRight = f >= 4;
                            const quad = isRight ? rightQuad : leftQuad;
                            const localF = isRight ? (f - 4) : f;

                            const u0 = localF / 4;
                            const u1 = (localF + 1) / 4;
                            const v0 = r / 4;
                            const v1 = (r + 1) / 4;

                            const p0 = bilerp(quad.P00, quad.P10, quad.P01, quad.P11, u0, v0);
                            const p1 = bilerp(quad.P00, quad.P10, quad.P01, quad.P11, u1, v0);
                            const p2 = bilerp(quad.P00, quad.P10, quad.P01, quad.P11, u1, v1);
                            const p3 = bilerp(quad.P00, quad.P10, quad.P01, quad.P11, u0, v1);

                            cell.poly = [p0, p1, p2, p3];
                            cell.center = bilerp(quad.P00, quad.P10, quad.P01, quad.P11, (localF + 0.5) / 4, (r + 0.5) / 4);
                        }
                    }
                }
            }

            stepOrthogonal(s, r, f, dr, df) {
                const N = this.numPlayers;
                if (dr !== 0 && df === 0) {
                    const nr = r + dr;
                    if (nr >= 0 && nr <= 3) {
                        return { s, r: nr, f, dr, df };
                    }
                    if (nr < 0) return null;

                    if (N === 2) {
                        return { s: (s + 1) % 2, r: 3, f: 7 - f, dr: -1, df: 0 };
                    }

                    if (f < 4) {
                        return { s: (s + 1) % N, r: 3, f: 7 - f, dr: -1, df: 0 };
                    } else {
                        return { s: (s + N - 1) % N, r: 3, f: 7 - f, dr: -1, df: 0 };
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

                if (nr >= 0 && nr <= 3 && nf >= 0 && nf <= 7) {
                    return [{ s, r: nr, f: nf, dr, df }];
                }

                if (nr < 0 || nf < 0 || nf > 7) {
                    return [];
                }

                if (nr === 4) {
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
                                r: 3,
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
                            r: 3,
                            f: 7 - nf,
                            dr: -1,
                            df: -df
                        });
                    } else if (f >= 4 && nf >= 4 && nf <= 7) {
                        results.push({
                            s: (s + N - 1) % N,
                            r: 3,
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

