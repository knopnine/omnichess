export const multiplayerRules = {
            multiPseudo(fromCell, boardMap) {
                if (!fromCell) return [];
                const piece = boardMap.get(fromCell.key);
                if (!piece || piece.frozen) return [];

                const moves = [];
                const { s, r, f } = fromCell;
                const owner = piece.owner;

                const canLand = (targetKey) => {
                    const occ = boardMap.get(targetKey);
                    if (!occ) return { ok: true, capture: false };
                    if (occ.owner !== owner && !occ.frozen) return { ok: true, capture: true };
                    return { ok: false, capture: false };
                };

                // Pawn
                if (piece.type === 'P') {
                    const forwardDr = (s === owner) ? 1 : -1;
                    const step1 = this.topology.stepOrthogonal(s, r, f, forwardDr, 0);
                    if (step1) {
                        const c1 = this.topology.getCell(step1.s, step1.r, step1.f);
                        if (c1 && !boardMap.has(c1.key)) {
                            const isPromo = (c1.s !== owner && c1.r === 0);
                            moves.push({ from: fromCell, to: c1, capture: false, promotion: isPromo });

                            if (s === owner && r === 1) {
                                const step2 = this.topology.stepOrthogonal(step1.s, step1.r, step1.f, step1.dr, 0);
                                if (step2) {
                                    const c2 = this.topology.getCell(step2.s, step2.r, step2.f);
                                    if (c2 && !boardMap.has(c2.key)) {
                                        moves.push({ from: fromCell, to: c2, capture: false, promotion: false });
                                    }
                                }
                            }
                        }
                    }

                    for (const df of [-1, 1]) {
                        const diagSteps = this.topology.stepDiagonal(s, r, f, forwardDr, df);
                        for (const dst of diagSteps) {
                            const targetCell = this.topology.getCell(dst.s, dst.r, dst.f);
                            if (targetCell) {
                                const occ = boardMap.get(targetCell.key);
                                if (occ && occ.owner !== owner && !occ.frozen) {
                                    const isPromo = (targetCell.s !== owner && targetCell.r === 0);
                                    moves.push({ from: fromCell, to: targetCell, capture: true, promotion: isPromo });
                                }
                            }
                        }
                    }
                }

                // Knight
                else if (piece.type === 'N') {
                    const targets = this.topology.getKnightTargets(s, r, f);
                    for (const targetCell of targets) {
                        const status = canLand(targetCell.key);
                        if (status.ok) {
                            moves.push({ from: fromCell, to: targetCell, capture: status.capture });
                        }
                    }
                }

                // Rook & Queen
                if (piece.type === 'R' || piece.type === 'Q') {
                    const dirs = [
                        { dr: 1, df: 0 },
                        { dr: -1, df: 0 },
                        { dr: 0, df: 1 },
                        { dr: 0, df: -1 }
                    ];
                    for (const d of dirs) {
                        let cur = { s, r, f, dr: d.dr, df: d.df };
                        for (let step = 0; step < 16; step++) {
                            const next = this.topology.stepOrthogonal(cur.s, cur.r, cur.f, cur.dr, cur.df);
                            if (!next) break;
                            const targetCell = this.topology.getCell(next.s, next.r, next.f);
                            if (!targetCell) break;

                            const occ = boardMap.get(targetCell.key);
                            if (!occ) {
                                moves.push({ from: fromCell, to: targetCell, capture: false });
                                cur = next;
                            } else {
                                if (occ.owner !== owner && !occ.frozen) {
                                    moves.push({ from: fromCell, to: targetCell, capture: true });
                                }
                                break;
                            }
                        }
                    }
                }

                // Bishop & Queen
                if (piece.type === 'B' || piece.type === 'Q') {
                    const diagDirs = [
                        { dr: 1, df: 1 },
                        { dr: 1, df: -1 },
                        { dr: -1, df: 1 },
                        { dr: -1, df: -1 }
                    ];
                    for (const d of diagDirs) {
                        const queue = [{ s, r, f, dr: d.dr, df: d.df, depth: 0 }];
                        const visitedInRay = new Set();

                        while (queue.length > 0) {
                            const cur = queue.shift();
                            if (cur.depth > 14) continue;

                            const nextStates = this.topology.stepDiagonal(cur.s, cur.r, cur.f, cur.dr, cur.df);
                            for (const next of nextStates) {
                                const targetCell = this.topology.getCell(next.s, next.r, next.f);
                                if (!targetCell) continue;
                                if (visitedInRay.has(targetCell.key)) continue;
                                visitedInRay.add(targetCell.key);

                                const occ = boardMap.get(targetCell.key);
                                if (!occ) {
                                    moves.push({ from: fromCell, to: targetCell, capture: false });
                                    queue.push({ ...next, depth: cur.depth + 1 });
                                } else {
                                    if (occ.owner !== owner && !occ.frozen) {
                                        moves.push({ from: fromCell, to: targetCell, capture: true });
                                    }
                                }
                            }
                        }
                    }
                }

                // King
                if (piece.type === 'K') {
                    const orthoDirs = [
                        { dr: 1, df: 0 },
                        { dr: -1, df: 0 },
                        { dr: 0, df: 1 },
                        { dr: 0, df: -1 }
                    ];
                    for (const d of orthoDirs) {
                        const next = this.topology.stepOrthogonal(s, r, f, d.dr, d.df);
                        if (next) {
                            const targetCell = this.topology.getCell(next.s, next.r, next.f);
                            if (targetCell) {
                                const status = canLand(targetCell.key);
                                if (status.ok) moves.push({ from: fromCell, to: targetCell, capture: status.capture });
                            }
                        }
                    }

                    const diagDirs = [
                        { dr: 1, df: 1 },
                        { dr: 1, df: -1 },
                        { dr: -1, df: 1 },
                        { dr: -1, df: -1 }
                    ];
                    for (const d of diagDirs) {
                        const nextStates = this.topology.stepDiagonal(s, r, f, d.dr, d.df);
                        for (const next of nextStates) {
                            const targetCell = this.topology.getCell(next.s, next.r, next.f);
                            if (targetCell) {
                                const status = canLand(targetCell.key);
                                if (status.ok) moves.push({ from: fromCell, to: targetCell, capture: status.capture });
                            }
                        }
                    }

                    if (!piece.moved && s === owner && r === 0 && f === 4) {
                        const krKey = this.topology.key(s, 0, 7);
                        const kr = boardMap.get(krKey);
                        if (kr && kr.type === 'R' && kr.owner === owner && !kr.moved) {
                            if (!boardMap.has(this.topology.key(s, 0, 5)) && !boardMap.has(this.topology.key(s, 0, 6))) {
                                moves.push({
                                    from: fromCell,
                                    to: this.topology.getCell(s, 0, 6),
                                    capture: false,
                                    castle: 'K'
                                });
                            }
                        }
                        const qrKey = this.topology.key(s, 0, 0);
                        const qr = boardMap.get(qrKey);
                        if (qr && qr.type === 'R' && qr.owner === owner && !qr.moved) {
                            if (
                                !boardMap.has(this.topology.key(s, 0, 1)) &&
                                !boardMap.has(this.topology.key(s, 0, 2)) &&
                                !boardMap.has(this.topology.key(s, 0, 3))
                            ) {
                                moves.push({
                                    from: fromCell,
                                    to: this.topology.getCell(s, 0, 2),
                                    capture: false,
                                    castle: 'Q'
                                });
                            }
                        }
                    }
                }

                return moves;
            }
};
