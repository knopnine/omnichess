import { Game } from '../engine/game.js';
import { MASTER_PLAYERS } from '../engine/players.js';
import { Persistence, restoreGame, serializeGame } from '../engine/persistence.js';
import { BoardView, pieceIcon, PIECE_NAMES } from './board.js';
import { BoardTopology } from '../engine/topology.js';

const escapeHTML = value => String(value).replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
export const rankArmies = game => {
    const chances = game.estimateWinChances();
    return Array.from({ length:game.numPlayers }, (_, p) => p).sort((a,b) => chances[b] - chances[a] || a-b);
};

export class App {
    constructor(doc, { storage, boardFactory = (...args) => new BoardView(...args), clock } = {}) {
        this.doc = doc; this.$ = id => doc.getElementById(id);
        this.page = null; this.hasMatch = false; this.resultSeen = null; this.lastTurn = '';
        this.pendingConfirm = null; this.dialogFocus = new Map(); this.setupSeats = [false,true,true,true,true,true];
        try { storage ??= window.localStorage; } catch { storage = { getItem(){ throw new Error('Unavailable'); }, setItem(){ throw new Error('Unavailable'); } }; }
        this.persistence = new Persistence(storage, message => { this.$('storage-warning').textContent = message; this.$('storage-warning').hidden = false; });
        this.saved = this.persistence.read();
        this.$('count-diagram').classList.add('count-illustrations');
        this.$('count-diagram').innerHTML = [2,3,4,5,6].map(n => {
            const topology = new BoardTopology(n); topology.computeGeometry(27);
            return `<svg viewBox="-32 -32 64 80" role="img" aria-label="${n}-player board"><polygon points="${topology.outerPolygon.map(p => `${p.x},${p.y}`).join(' ')}" fill="#d9c49e" stroke="#69513b"/><text x="0" y="43" text-anchor="middle" fill="#24221e" font-size="12">${n}</text></svg>`;
        }).join('');
        this.game = new Game({ clock });
        this.homeGame = new Game(); this.homeGame.showCoords = false;
        this.previewGame = new Game(); this.previewGame.showCoords = false;
        this.guideGame = new Game(); this.guideGame.showCoords = false;
        this.homeView = boardFactory(this.$('home-board'), this.homeGame);
        this.setupView = boardFactory(this.$('setup-board'), this.previewGame);
        this.guideView = boardFactory(this.$('guide-board'), this.guideGame);
        this.boardView = boardFactory(this.$('game-board'), this.game, { interactive:true, onDescribe:text => { this.$('board-description').textContent = text; } });
        this.game.onChange = () => { this.render(); this.save(); };
        this.game.onEvent = message => { this.$('announcer').textContent = message; this.$('arena-message').textContent = message; };
        this.bind(); this.showGuideExample('rook'); this.showSetup(); this.route(); this.updateResume();
    }
    bind() {
        this.doc.querySelector('.skip-link').addEventListener('click', e => { e.preventDefault(); this.$('main').focus(); });
        this.doc.addEventListener('click', e => {
            const mode = e.target.closest('[data-mode]');
            if (mode) { this.setupSeats = [mode.dataset.mode === 'watch',true,true,true,true,true]; this.showSetup(); }
            const button = e.target.closest('[data-action]');
            if (button) this.action(button.dataset.action);
            const seat = e.target.closest('[data-seat]');
            if (seat) this.game.toggleSeatController(Number(seat.dataset.seat));
            const tab = e.target.closest('[data-tab]');
            if (tab) this.selectTab(tab.dataset.tab);
            const example = e.target.closest('[data-example]');
            if (example) this.showGuideExample(example.dataset.example);
        });
        this.doc.querySelector('.mobile-tabs').addEventListener('keydown', e => {
            if (['ArrowLeft','ArrowRight'].includes(e.key)) { e.preventDefault(); const tab = e.target.dataset.tab === 'armies' ? 'moves' : 'armies'; this.selectTab(tab); this.$(tab === 'armies' ? 'armies-tab' : 'moves-tab').focus(); }
        });
        this.$('setup-form').addEventListener('change', e => {
            if (e.target.dataset.setupSeat) this.setupSeats[Number(e.target.dataset.setupSeat)] = e.target.value === 'ai';
            if (e.target.name === 'players') this.showSetup();
        });
        this.$('setup-form').addEventListener('submit', e => { e.preventDefault(); this.confirmReplacement(() => this.startSetup()); });
        this.$('speed').addEventListener('change', e => this.game.setSpeed(e.target.value));
        this.$('match-difficulty').addEventListener('change', e => { this.game.difficulty = e.target.value; this.game.emit(); });
        this.$('match-victory').addEventListener('change', e => { if (this.game.numPlayers > 2) this.game.victoryMode = e.target.value; this.game.emit(); });
        this.$('match-conquest').addEventListener('change', e => { if (this.game.numPlayers > 2) this.game.convertOnKingKill = e.target.checked; this.game.emit(); });
        this.$('match-promotion').addEventListener('change', e => { this.game.autoQueen = e.target.value; this.game.emit(); });
        for (const dialog of this.doc.querySelectorAll('dialog')) {
            dialog.addEventListener('close', () => {
                if (dialog.id === 'promotion-dialog' && this.game.pendingPromotion) { this.game.pendingPromotion = null; this.game.clearSelection(); }
                if (dialog.id === 'confirm-dialog') this.pendingConfirm = null;
                this.game.unsuspend(dialog.id);
                this.dialogFocus.get(dialog.id)?.focus(); this.dialogFocus.delete(dialog.id);
            });
        }
        this.$('confirm-cancel').addEventListener('click', () => this.closeDialog('confirm-dialog'));
        this.$('confirm-accept').addEventListener('click', () => { const callback = this.pendingConfirm; this.pendingConfirm = null; this.closeDialog('confirm-dialog'); callback?.(); });
        this.$('promotion-choices').innerHTML = ['Q','R','B','N'].map(type => `<button type="button" data-promote="${type}">${pieceIcon(type)}<span>${PIECE_NAMES[type]}</span></button>`).join('');
        this.$('promotion-choices').addEventListener('click', e => {
            const button = e.target.closest('[data-promote]');
            if (!button) return;
            const type = button.dataset.promote;
            // Commit after removing this modal's suspension, without rescheduling AI.
            this.game.suspensions.delete('promotion-dialog'); this.game.completePromotion(type); this.closeDialog('promotion-dialog');
        });
        window.addEventListener('hashchange', () => this.route());
        window.addEventListener('pagehide', () => { this.save(); this.game.cancelAI(); });
        this.selectTab('armies');
    }
    action(action) {
        const g = this.game;
        if (action === 'resume') {
            const data = this.hasMatch ? serializeGame(g) : this.saved;
            if (data) { restoreGame(g,data); this.hasMatch = true; this.resultSeen = null; this.go('play'); }
        } else if (action === 'pause') g.togglePause();
        else if (action === 'step') g.stepAI();
        else if (action === 'undo') g.undoMove();
        else if (action === 'hint') g.showHint();
        else if (action === 'coords') { g.showCoords = !g.showCoords; g.emit(); }
        else if (action === 'settings') {
            this.$('match-difficulty').value = g.difficulty; this.$('match-victory').value = g.victoryMode;
            this.$('match-promotion').value = g.autoQueen; this.$('match-conquest').checked = g.convertOnKingKill;
            this.$('match-victory').disabled = this.$('match-conquest').disabled = g.numPlayers === 2;
            this.showDialog('settings-dialog');
        } else if (action === 'spectate') { g.toggleSpectatorMode(); this.closeDialog('settings-dialog'); }
        else if (action === 'reset') this.confirmReplacement(() => this.restart());
        else if (action === 'rematch') { this.closeDialog('results-dialog'); this.restart(); }
        else if (action === 'new-setup') { this.closeDialog('results-dialog'); this.go('setup'); }
        else if (action === 'inspect') this.closeDialog('results-dialog');
        else if (action === 'cancel-promotion') this.closeDialog('promotion-dialog');
        else if (action === 'return-match') this.go('play');
    }
    showDialog(id) {
        const dialog = this.$(id); if (dialog.open) return;
        this.dialogFocus.set(id, this.doc.activeElement); dialog.showModal(); this.game.suspend(id);
    }
    closeDialog(id) { if (this.$(id).open) this.$(id).close(); }
    confirmReplacement(callback) {
        const played = this.hasMatch ? this.game.plyCount > 0 : this.saved?.state.plyCount > 0;
        if (!played) { callback(); return; }
        this.pendingConfirm = callback;
        this.$('confirm-message').textContent = 'Starting a new match replaces the current local save. Keep this match to return without losing its position.';
        this.showDialog('confirm-dialog');
    }
    showSetup() {
        const n = Number(this.doc.querySelector('input[name=players]:checked').value);
        this.previewGame.setPlayerCount(n); this.previewGame.showCoords = false;
        this.$('setup-seats').innerHTML = MASTER_PLAYERS.slice(0,n).map((p,i) => `<div class="seat-row"><span class="army-dot" style="background:${p.primary}"></span><label for="seat-${i}">${p.name}</label><select id="seat-${i}" data-setup-seat="${i}"><option value="human"${this.setupSeats[i] ? '' : ' selected'}>Human</option><option value="ai"${this.setupSeats[i] ? ' selected' : ''}>AI</option></select></div>`).join('');
        this.$('setup-victory').disabled = this.$('setup-conquest').disabled = n === 2;
        this.$('classic-note').hidden = n !== 2;
        this.$('setup-caption').textContent = `${n} armies · ${n*32} squares · ${n*16} starting pieces`;
        this.setupView.draw();
    }
    showGuideExample(example) {
        const g = this.guideGame;
        g.board.clear();
        const cell = g.topology.getCell(0,example === 'bishop' ? 3 : 2,3);
        g.board.set(cell.key,{type:example === 'bishop' ? 'B' : 'R',owner:0,moved:true,frozen:false});
        g.selectedCell = cell; g.legalMoves = g.getPseudoMovesForCell(cell);
        this.$('guide-caption').textContent = example === 'bishop' ? 'Dots show the bishop branching through the center into both opposing sectors.' : 'Dots show where the rook can move across a seam.';
        this.$('guide-board').setAttribute('aria-label',`${example === 'bishop' ? 'Bishop central branches' : 'Rook seam destinations'} on an empty three-player board`);
        for (const button of this.doc.querySelectorAll('[data-example]')) { button.setAttribute('aria-pressed',String(button.dataset.example === example)); button.classList.toggle('primary',button.dataset.example === example); }
        this.guideView.draw();
    }
    startSetup() {
        this.hasMatch = false;
        const g = this.game;
        g.cancelAI(); g.inArena = false;
        g.numPlayers = Number(this.doc.querySelector('input[name=players]:checked').value);
        g.seatsIsAI = [...this.setupSeats]; g.difficulty = this.$('setup-difficulty').value;
        g.victoryMode = this.$('setup-victory').value; g.convertOnKingKill = this.$('setup-conquest').checked;
        g.autoQueen = this.$('setup-promotion').value;
        g.suspensions.clear(); g.isPaused = false; g.newGame();
        this.resetBoardMessage();
        this.hasMatch = true; this.justStarted = true; this.resultSeen = null; this.save(); this.go('play');
    }
    restart() {
        this.game.suspensions.clear(); this.game.pendingPromotion = null;
        for (const d of this.doc.querySelectorAll('dialog[open]')) d.close();
        this.resultSeen = null; this.game.isPaused = false; this.game.newGame(); this.resetBoardMessage(); this.render(); this.save();
    }
    resetBoardMessage() {
        this.$('arena-message').textContent = ''; this.$('announcer').textContent = ''; this.lastTurn = '';
        this.$('board-description').textContent = 'Select a piece to see its legal moves.';
        this.$('game-board').setAttribute('aria-label','Chess board. Arrow keys navigate, Enter selects or moves, Escape clears selection.');
        this.boardView.focusKey = this.game.topology.getCell(0,1,4).key;
    }
    go(page) { if (window.location.hash === `#/${page === 'home' ? '' : page}`) this.route(); else window.location.hash = `#/${page === 'home' ? '' : page}`; }
    route() {
        let page = window.location.hash.slice(2) || 'home';
        if (!['home','setup','play','guide'].includes(page)) page = 'home';
        if (page === 'play' && !this.hasMatch) page = 'setup';
        const previous = this.page;
        if (page === 'guide' && previous !== 'guide') this.guideFromArena = previous === 'play';
        if (previous === 'play' && page === 'guide' && this.hasMatch) this.game.suspend('guide-page');
        else if (previous === 'play' && page !== 'play') this.game.leaveArena();
        if (previous === 'guide' && page !== 'guide') {
            if (page !== 'play') this.game.leaveArena();
            this.game.unsuspend('guide-page');
        }
        this.page = page;
        for (const section of this.doc.querySelectorAll('[data-page]')) section.hidden = section.dataset.page !== page;
        for (const link of this.doc.querySelectorAll('[data-nav]')) {
            if (link.dataset.nav === page || (page === 'play' && link.dataset.nav === 'setup')) link.setAttribute('aria-current','page');
            else link.removeAttribute('aria-current');
        }
        this.$('guide-return').hidden = !this.hasMatch;
        if (page === 'play') {
            if (this.justStarted) { this.justStarted = false; this.game.inArena = true; this.game.scheduleNextTurnIfNeeded(); }
            else if ((previous !== 'guide' || !this.guideFromArena) && previous !== 'play') this.game.enterArena();
        }
        this.render(); this.homeView.draw(); this.setupView.draw(); this.guideView.draw();
        if (previous !== page) { this.$('main').focus({ preventScroll:true }); window.scrollTo(0,0); }
        this.updateResume();
    }
    selectTab(tab) {
        this.doc.querySelector('.arena-layout').dataset.mobileTab = tab;
        for (const button of this.doc.querySelectorAll('[data-tab]')) { button.setAttribute('aria-selected',String(button.dataset.tab === tab)); button.tabIndex = button.dataset.tab === tab ? 0 : -1; }
    }
    save() {
        if (!this.hasMatch) return;
        if (this.persistence.save(this.game)) this.saved = serializeGame(this.game);
        this.updateResume();
    }
    updateResume() { for (const button of this.doc.querySelectorAll('[data-action=resume]')) button.hidden = !this.hasMatch && !this.saved; }
    render() {
        const g = this.game;
        const check = !g.gameOver && g.isKingInCheck(g.turn);
        const turnText = g.gameOver ? (g.result.type === 'draw' ? 'Draw' : `${MASTER_PLAYERS[g.winnerId].name} wins`) : `${MASTER_PLAYERS[g.turn].name} to move${check ? ' · Check' : ''}${g.seatsIsAI[g.turn] ? (g.isPaused || g.suspensions.size ? ' · AI paused' : ' · AI') : ' · Human'}`;
        this.$('turn-text').textContent = turnText;
        this.$('match-details').textContent = `${g.numPlayers} players · ${g.numPlayers*32} squares · ${g.numPlayers === 2 ? 'Classic chess' : g.isConquestActive() ? 'Conquest on' : 'Conquest off'}`;
        if (this.page === 'play' && turnText !== this.lastTurn) { this.$('turn-announcer').textContent = turnText; this.lastTurn = turnText; }
        this.renderArmies(); this.renderMoves(); this.boardView.draw();
        this.doc.querySelector('[data-action=undo]').disabled = !g.canUndo();
        this.doc.querySelector('[data-action=hint]').hidden = g.spectatorMode;
        this.doc.querySelector('[data-action=hint]').disabled = g.gameOver || g.seatsIsAI[g.turn];
        this.doc.querySelector('[data-action=coords]').setAttribute('aria-pressed',String(g.showCoords));
        const pause = this.doc.querySelector('[data-action=pause]'); pause.textContent = g.isPaused ? 'Resume AI' : 'Pause AI'; pause.disabled = g.gameOver;
        this.doc.querySelector('[data-action=step]').disabled = g.gameOver || !g.seatsIsAI[g.turn];
        this.doc.querySelector('.simulation-controls').hidden = !g.seatsIsAI.slice(0,g.numPlayers).some(Boolean);
        this.$('speed').value = String(g.aiDelay);
        this.doc.querySelector('[data-action=spectate]').textContent = g.spectatorMode ? 'Return Gold to human' : 'Switch all seats to AI';
        if (this.page === 'play' && g.pendingPromotion) this.showDialog('promotion-dialog');
        if (!g.gameOver) this.resultSeen = null;
        else if (this.page === 'play') {
            const resultKey = JSON.stringify(g.result) + ':' + g.plyCount;
            if (resultKey !== this.resultSeen) {
                this.resultSeen = resultKey; this.$('results-title').textContent = g.result.type === 'draw' ? 'A drawn match.' : `${MASTER_PLAYERS[g.winnerId].name} takes the table.`;
                this.$('results-reason').textContent = g.result.reason; this.showDialog('results-dialog');
            }
        }
    }
    renderArmies() {
        const g = this.game, list = this.$('army-list'), chances = g.estimateWinChances();
        for (const element of [...list.children]) if (Number(element.dataset.army) >= g.numPlayers) element.remove();
        const order = rankArmies(g);
        for (const p of order) {
            let card = list.querySelector(`[data-army="${p}"]`);
            if (!card) {
                card = this.doc.createElement('article'); card.dataset.army = p; card.className = 'army-card';
                card.innerHTML = `<div class="army-top"><div class="army-identity"><span class="army-dot"></span><span class="army-name"></span></div><button class="controller-button" data-seat="${p}"></button></div><p class="army-status"></p><div class="army-estimate"><span>Est. win chance</span><strong></strong></div><div class="chance-meter" role="meter" aria-valuemin="0" aria-valuemax="100"><div></div></div><div class="army-material"><span></span><div class="captures"></div></div>`;
                list.append(card);
            }
            const info = MASTER_PLAYERS[p];
            card.classList.toggle('current',p === g.turn && !g.gameOver);
            card.querySelector('.army-dot').style.background = info.primary;
            card.querySelector('.army-name').textContent = info.name;
            const controller = card.querySelector('[data-seat]'); controller.textContent = g.seatsIsAI[p] ? 'AI' : 'Human'; controller.setAttribute('aria-label',`${info.name}: ${g.seatsIsAI[p] ? 'AI, switch to human' : 'human, switch to AI'}`);
            controller.disabled = g.gameOver || g.eliminated[p];
            card.querySelector('.army-status').textContent = g.eliminated[p] ? 'Eliminated' : g.gameOver ? (g.winnerId === p ? 'Winner' : 'Match complete') : g.isKingInCheck(p) ? 'In check' : p === g.turn ? 'To move' : `Sector ${info.sectorCode}`;
            card.querySelector('.army-estimate strong').textContent = g.result.type === 'draw' ? 'Draw' : `${chances[p].toFixed(1)}%`;
            const meter = card.querySelector('.chance-meter'); meter.hidden = g.result.type === 'draw'; meter.setAttribute('aria-label',`${info.name} estimated win chance`); meter.setAttribute('aria-valuenow',chances[p]); meter.setAttribute('aria-valuetext',`${chances[p].toFixed(1)} percent, position-based estimate`);
            meter.firstElementChild.style.width = `${chances[p]}%`; meter.firstElementChild.style.background = info.secondary;
            card.querySelector('.army-material>span').textContent = `Material ${g.getMaterialScore(p)}`;
            const captures = card.querySelector('.captures'); captures.innerHTML = g.captures[p].map(t => pieceIcon(t)).join('') || 'No captures'; captures.setAttribute('aria-label',g.captures[p].length ? `Captured: ${g.captures[p].map(t => PIECE_NAMES[t]).join(', ')}` : 'No captures');
        }
        // Reorder existing nodes and restore the same focused controller.
        const focused = list.contains(this.doc.activeElement) ? this.doc.activeElement : null;
        order.forEach((p,i) => { const card = list.querySelector(`[data-army="${p}"]`); if (list.children[i] !== card) list.insertBefore(card,list.children[i] || null); });
        if (focused && this.doc.activeElement !== focused) focused.focus({ preventScroll:true });
    }
    renderMoves() {
        const g = this.game; this.$('ply-label').textContent = `Ply ${g.plyCount}`;
        this.$('move-list').innerHTML = g.moveLogs.length ? g.moveLogs.slice(0,80).map(m => `<li><div class="move-top"><span>${MASTER_PLAYERS[m.player].name}</span><span>${m.ply}</span></div><span>${escapeHTML(m.text)}</span></li>`).join('') : '<li class="quiet">The opening is yours. Moves will appear here.</li>';
    }
}
