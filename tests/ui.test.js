import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';
import { App } from '../src/ui/app.js';
import { FakeClock, move, fixture, cell } from './helpers.js';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
function createApp() {
    const dom=new JSDOM(html,{url:'http://localhost/'});globalThis.window=dom.window;globalThis.document=dom.window.document;dom.window.scrollTo=()=>{};
    dom.window.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
    dom.window.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');this.dispatchEvent(new dom.window.Event('close'));};
    const clock=new FakeClock();const app=new App(dom.window.document,{clock,boardFactory:()=>({draw(){}})});
    return {app,dom,clock};
}
test('setup supports all counts and disables multiplayer rules in classic mode',()=>{
    const {app,dom}=createApp();for(let n=2;n<=6;n++){const radio=dom.window.document.querySelector(`input[name=players][value="${n}"]`);radio.checked=true;app.showSetup();assert.equal(app.$('setup-seats').children.length,n);assert.equal(app.$('setup-conquest').disabled,n===2);assert.equal(app.previewGame.topology.cells.length,n*32);}dom.window.close();
});
test('ranked cards retain controller identity and keyboard focus',()=>{
    const {app,dom}=createApp();app.hasMatch=true;dom.window.location.hash='#/play';app.route();const g=app.game;const controller=app.$('army-list').querySelector('[data-seat="1"]');controller.focus();g.estimateWinChances=()=>[10,70,20];app.renderArmies();
    assert.deepEqual([...app.$('army-list').children].map(e=>Number(e.dataset.army)),[1,2,0]);assert.equal(dom.window.document.activeElement,controller);controller.click();assert.equal(g.seatsIsAI[1],false);dom.window.close();
});
test('draw renders Draw and hides meters',()=>{const {app,dom}=createApp();app.game.finish({type:'draw',reason:'Stalemate'});app.render();assert.ok([...app.$('army-list').querySelectorAll('strong')].every(e=>e.textContent==='Draw'));assert.ok([...app.$('army-list').querySelectorAll('[role=meter]')].every(e=>e.hidden));dom.window.close();});
test('reset confirmation cancellation preserves the match',()=>{const {app,dom}=createApp();app.game.setPlayerCount(2);app.hasMatch=true;move(app.game,'e2','e4');app.action('reset');assert.equal(app.$('confirm-dialog').open,true);app.$('confirm-cancel').click();assert.equal(app.game.plyCount,1);assert.equal(app.game.board.get(app.game.topology.cells.find(c=>c.coord==='e4').key).type,'P');dom.window.close();});
test('confirming reset starts a new match',()=>{const {app,dom}=createApp();app.game.setPlayerCount(2);app.hasMatch=true;move(app.game,'e2','e4');app.action('reset');app.$('confirm-accept').click();assert.equal(app.game.plyCount,0);assert.equal(app.game.gameOver,false);dom.window.close();});
test('settings suspend AI until closed and retain pause state',()=>{const {app,dom,clock}=createApp();app.hasMatch=true;app.game.seatsIsAI[0]=true;app.game.enterArena();app.game.togglePause();assert.equal(clock.tasks.size,1);app.action('settings');assert.equal(clock.tasks.size,0);app.closeDialog('settings-dialog');assert.equal(clock.tasks.size,1);app.game.cancelAI();dom.window.close();});
test('guide suspends a running match and return resumes prior state',()=>{const {app,dom,clock}=createApp();app.hasMatch=true;app.game.seatsIsAI[0]=true;dom.window.location.hash='#/play';app.route();app.game.togglePause();assert.equal(clock.tasks.size,1);dom.window.location.hash='#/guide';app.route();assert.equal(clock.tasks.size,0);dom.window.location.hash='#/play';app.route();assert.equal(clock.tasks.size,1);app.game.cancelAI();dom.window.close();});
test('leaving arena pauses match; saved match restoration stays paused',()=>{const {app,dom,clock}=createApp();app.hasMatch=true;app.game.seatsIsAI[0]=true;dom.window.location.hash='#/play';app.route();app.game.togglePause();dom.window.location.hash='#/';app.route();assert.equal(clock.tasks.size,0);assert.equal(app.game.isPaused,true);app.action('resume');assert.equal(app.game.isPaused,true);app.game.cancelAI();dom.window.close();});
test('mobile detail tabs update selection and keyboard order',()=>{const {app,dom}=createApp();app.selectTab('moves');assert.equal(app.$('moves-tab').getAttribute('aria-selected'),'true');assert.equal(app.$('armies-tab').tabIndex,-1);assert.equal(dom.window.document.querySelector('.arena-layout').dataset.mobileTab,'moves');dom.window.close();});
test('returning to a match from guide reached through home enables AI correctly',()=>{
    const {app,dom,clock}=createApp();app.hasMatch=true;app.game.seatsIsAI[0]=true;
    dom.window.location.hash='#/guide';app.route();dom.window.location.hash='#/play';app.route();
    assert.equal(app.game.inArena,true);assert.equal(app.game.isPaused,true);app.game.togglePause();assert.equal(clock.tasks.size,1);app.game.cancelAI();dom.window.close();
});
test('skip link focuses content without changing the active screen',()=>{
    const {app,dom}=createApp();app.hasMatch=true;dom.window.location.hash='#/play';app.route();
    dom.window.document.querySelector('.skip-link').click();assert.equal(app.page,'play');assert.equal(dom.window.location.hash,'#/play');assert.equal(dom.window.document.activeElement,app.$('main'));dom.window.close();
});
test('guide examples show destinations in opposing sectors',()=>{const {app,dom}=createApp();for(const example of ['rook','bishop']){app.showGuideExample(example);assert.ok(app.guideGame.legalMoves.some(m=>m.to.s!==0));assert.equal(app.$('guide-caption').textContent.includes(example),true);}dom.window.close();});
test('results allow board inspection and rematch clears the old message',()=>{
    const {app,dom}=createApp();app.hasMatch=true;dom.window.location.hash='#/play';app.route();
    app.game.triggerGameOver(1,'Checkmate');assert.equal(app.$('results-dialog').open,true);app.action('inspect');assert.equal(app.$('results-dialog').open,false);assert.equal(app.game.gameOver,true);
    app.action('rematch');assert.equal(app.game.gameOver,false);assert.equal(app.game.plyCount,0);assert.equal(app.$('arena-message').textContent,'');dom.window.close();
});
test('promotion dialog can cancel and then commit a knight choice',()=>{
    const {app,dom}=createApp();app.hasMatch=true;app.game.setPlayerCount(2);
    const position=fixture(2,{e1:['K',0],h8:['K',1],a7:['P',0],h7:['R',1]});app.game.restoreState(position.snapshot());
    dom.window.location.hash='#/play';app.route();app.game.selectCell(cell(app.game,'a7'));app.game.selectCell(cell(app.game,'a8'));
    assert.equal(app.$('promotion-dialog').open,true);app.action('cancel-promotion');assert.equal(app.game.pendingPromotion,null);assert.equal(app.game.plyCount,0);
    app.game.selectCell(cell(app.game,'a7'));app.game.selectCell(cell(app.game,'a8'));app.$('promotion-choices').querySelector('[data-promote=N]').click();
    assert.equal(app.$('promotion-dialog').open,false);assert.equal(app.game.board.get(cell(app.game,'a8').key).type,'N');assert.equal(app.game.plyCount,1);dom.window.close();
});
