import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/engine/game.js';
import { globalSquare, updateClassicMetadata, positionKey, insufficientMaterial } from '../src/engine/rules.js';
import { fixture, cell, move } from './helpers.js';

test('standard opening placement and perft through three plies', () => {
    const g = new Game({numPlayers:2});
    assert.equal(g.board.get(cell(g,'d8').key).type,'Q');
    assert.equal(g.board.get(cell(g,'e8').key).type,'K');
    function perft(depth) {
        if (!depth) return 1;
        let total = 0;
        for (const m of g.getAllLegalMovesForPlayer(g.turn)) {
            const snapshot = g.snapshot();
            const piece = g.board.get(m.from.key), captured = g.board.get(m.to.key);
            updateClassicMetadata(g,m,piece,captured); g.board = g.simulateMove(m); g.turn = 1-g.turn;
            total += perft(depth-1); g.restoreState(snapshot);
        }
        return total;
    }
    assert.deepEqual([perft(1),perft(2),perft(3)],[20,400,8902]);
});

for (const owner of [0,1]) {
    test(`castling on both sides for army ${owner}`, () => {
        const g = fixture(2,{ e1:['K',0],a1:['R',0],h1:['R',0],e8:['K',1],a8:['R',1],h8:['R',1] });
        g.turn = owner; g.castlingRights[owner] = { K:true,Q:true };
        const king = owner === 0 ? 'e1' : 'e8';
        assert.deepEqual(g.getLegalMovesForCell(cell(g,king)).filter(m => m.castle).map(m => m.castle).sort(),['K','Q']);
        move(g,king,owner === 0 ? 'g1' : 'g8');
        assert.equal(g.board.get(cell(g,owner === 0 ? 'f1' : 'f8').key).type,'R');
        assert.deepEqual(g.castlingRights[owner],{K:false,Q:false});
    });
}

test('castling cannot pass through attacked squares or begin in check', () => {
    const g = fixture(2,{e1:['K',0],h1:['R',0],a8:['K',1],f8:['R',1]});
    g.castlingRights[0].K = true;
    assert.ok(!g.getLegalMovesForCell(cell(g,'e1')).some(m => m.castle));
    g.board.delete(cell(g,'f8').key); g.board.set(cell(g,'e8').key,{type:'R',owner:1,moved:true,frozen:false});
    assert.equal(g.isKingInCheck(0),true);
    assert.ok(!g.getLegalMovesForCell(cell(g,'e1')).some(m => m.castle));
});

test('rook movement and capture permanently remove castling rights', () => {
    const g = fixture(2,{e1:['K',0],h1:['R',0],e8:['K',1],a8:['R',1]});
    g.castlingRights = [{K:true,Q:false},{K:false,Q:true}];
    move(g,'h1','h2'); assert.equal(g.castlingRights[0].K,false);
    move(g,'a8','a1'); assert.equal(g.castlingRights[1].Q,false);
    const h = fixture(2,{e1:['K',0],h1:['R',0],e8:['K',1],h8:['R',1]});
    h.castlingRights[0].K = true; h.turn = 1;
    move(h,'h8','h1'); assert.equal(h.castlingRights[0].K,false);
});

test('en passant captures the pawn and expires after another move', () => {
    const g = fixture(2,{e1:['K',0],e8:['K',1],e5:['P',0],d7:['P',1]}); g.turn = 1;
    move(g,'d7','d5'); const ep = g.getLegalMovesForCell(cell(g,'e5')).find(m => m.to.coord === 'd6');
    assert.ok(ep.enPassant); move(g,'e5','d6');
    assert.equal(g.board.has(cell(g,'d5').key),false); assert.equal(g.enPassant,null);
    const h = fixture(2,{e1:['K',0],e8:['K',1],e5:['P',0],d7:['P',1]}); h.turn = 1;
    move(h,'d7','d5'); move(h,'e1','f1'); assert.equal(h.enPassant,null);
});

test('en passant cannot expose the king; illegal en passant omitted from repetition key', () => {
    const g = fixture(2,{h5:['K',0],e5:['P',0],a8:['K',1],a5:['R',1],d7:['P',1]}); g.turn = 1;
    move(g,'d7','d5');
    assert.ok(!g.getLegalMovesForCell(cell(g,'e5')).some(m => m.enPassant));
    const key = positionKey(g); g.enPassant = null; assert.equal(positionKey(g),key);
});

for (const type of ['Q','R','B','N']) test(`pawn can promote to ${type}`, () => {
    const g = fixture(2,{e1:['K',0],h8:['K',1],a7:['P',0]}); move(g,'a7','a8',type);
    assert.equal(g.board.get(cell(g,'a8').key).type,type);
});

test('standard mode rejects king capture and king adjacency', () => {
    const g = fixture(2,{e1:['K',0],e3:['K',1],a3:['R',0]});
    assert.ok(!g.getPseudoMovesForCell(cell(g,'a3')).some(m => m.to.coord === 'e3'));
    assert.ok(!g.getLegalMovesForCell(cell(g,'e1')).some(m => m.to.coord === 'e2'));
});

test('checkmate wins before a move-count draw', () => {
    const g = fixture(2,{f6:['K',0],g6:['Q',0],h8:['K',1]}); g.halfMoveCount = 99;
    move(g,'g6','g7'); assert.deepEqual(g.result,{type:'win',winner:0,reason:'Checkmate'});
});
test('stalemate is a draw', () => {
    const g = fixture(2,{f7:['K',0],g5:['Q',0],h8:['K',1]});
    move(g,'g5','g6'); assert.deepEqual(g.result,{type:'draw',reason:'Stalemate'});
});
test('threefold repetition is automatic', () => {
    const g = new Game({numPlayers:2});
    for (let i=0;i<2;i++) { move(g,'g1','f3'); move(g,'g8','f6'); move(g,'f3','g1'); move(g,'f6','g8'); }
    assert.equal(g.result.reason,'Threefold repetition');
});
test('50-move rule and pawn/capture clock resets', () => {
    const g = fixture(2,{e1:['K',0],e8:['K',1],a1:['R',0]}); g.halfMoveCount = 99;
    move(g,'a1','a2'); assert.equal(g.result.reason,'50-move rule');
    const h = new Game({numPlayers:2}); h.halfMoveCount=99; move(h,'e2','e4'); assert.equal(h.halfMoveCount,0);
    const j = fixture(2,{e1:['K',0],e8:['K',1],a1:['R',0],a7:['P',1]}); j.halfMoveCount=99;
    move(j,'a1','a7'); assert.equal(j.halfMoveCount,0);
});
test('common insufficient material, including bishop square colors', () => {
    for (const pieces of [{e1:['K',0],e8:['K',1]},{e1:['K',0],e8:['K',1],a1:['B',0]},{e1:['K',0],e8:['K',1],a1:['N',0]},{e1:['K',0],e8:['K',1],c1:['B',0],f8:['B',1]}]) assert.equal(insufficientMaterial(fixture(2,pieces)),true);
    assert.equal(insufficientMaterial(fixture(2,{e1:['K',0],e8:['K',1],c1:['B',0],c8:['B',1]})),false);
});
test('repetition distinguishes castling rights and legal en passant', () => {
    const g = new Game({numPlayers:2}); const original=positionKey(g); g.castlingRights[0].K=false; assert.notEqual(positionKey(g),original);
    const h=fixture(2,{e1:['K',0],e8:['K',1],e5:['P',0],d7:['P',1]}); h.turn=1; move(h,'d7','d5'); const withEP=positionKey(h); h.enPassant=null; assert.notEqual(positionKey(h),withEP);
});
test('global adapter mirrors the Crimson sector correctly', () => { const g=new Game({numPlayers:2}); assert.deepEqual(globalSquare(cell(g,'e8')),{x:4,y:7}); });
test('irreversible moves prune unreachable repetition history to keep saves small',()=>{const g=new Game({numPlayers:2});move(g,'g1','f3');move(g,'g8','f6');assert.ok(g.repetitions.size>1);move(g,'e2','e4');assert.equal(g.repetitions.size,1);});
