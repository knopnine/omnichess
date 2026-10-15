import { writeFileSync } from 'node:fs';
import { BoardTopology } from '../src/engine/topology.js';
import { Game } from '../src/engine/game.js';
import { MASTER_PLAYERS } from '../src/engine/players.js';
import { uniformPieceFit } from '../src/engine/geometry.js';
import { PIECE_PATHS } from '../src/ui/board.js';

function board(players,style,cx,cy,radius) {
    const game=new Game({numPlayers:players,boardStyle:style});
    const topology=new BoardTopology(players,style);topology.computeGeometry(radius);
    const fit=uniformPieceFit(topology),ring=fit*.8;
    const polygon=poly=>poly.map(p=>`${p.x.toFixed(3)},${p.y.toFixed(3)}`).join(' ');
    const cells=topology.cells.map(c=>`<polygon points="${polygon(c.renderPoly||c.poly)}" fill="${['#f4e8cf','#b49a75','#d9c49e'][c.colorIndex]}" stroke="#69513b" stroke-width=".6"/>`).join('');
    const pieces=[...game.board].map(([key,p])=>{
        const cell=topology.cellMap.get(key),scale=ring*1.65/24;
        return `<g transform="translate(${cell.center.x},${cell.center.y})"><circle r="${ring}" fill="#fffcf5" stroke="${MASTER_PLAYERS[p.owner].primary}" stroke-width="${fit*.2}"/><g transform="scale(${scale}) translate(-12,-12)"><path d="${PIECE_PATHS[p.type]}" fill="#24221e"/></g></g>`;
    }).join('');
    const hole=style==='donut'?`<circle r="${topology.holeRadius}" fill="#f5f0e6" stroke="#69513b" stroke-width="1.2"/>`:'';
    return `<g transform="translate(${cx},${cy})"><polygon points="${polygon(topology.outerPolygon)}" fill="#69513b" stroke="#69513b" stroke-width="4" stroke-linejoin="round"/>${cells}${hole}${pieces}</g>`;
}
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="560" viewBox="0 0 1400 560" role="img" aria-labelledby="title description">
<title id="title">OmniChess — chess beyond two players</title>
<desc id="description">An ivory chess-club banner featuring six-arm and donut boards from OmniChess.</desc>
<rect width="1400" height="560" fill="#f5f0e6"/>
<path d="M48 32H1352M48 528H1352" stroke="#d3c6b4"/>
<g fill="#24221e" font-family="Georgia, 'Times New Roman', serif"><text x="68" y="142" font-size="66">OmniChess</text><text x="70" y="211" font-size="33">Chess beyond two players.</text></g>
<g font-family="Arial, sans-serif" fill="#69513b" font-size="21"><text x="72" y="272">A shared table. Two to six armies.</text><text x="72" y="305">Familiar pieces. Unexpected geometry.</text></g>
<path d="M72 347H480" stroke="#bba78d"/>
<text x="72" y="386" fill="#77521e" font-family="Arial, sans-serif" font-size="17" letter-spacing="1.2">LOCAL PLAY  /  HUMAN + AI  /  SPECTATE</text>
<text x="72" y="470" font-family="Arial, sans-serif" font-size="16" fill="#69513b">Square · Radial · Arms · Donut · Möbius</text>
${board(6,'six-arm',1050,280,225)}
${board(2,'donut',690,395,105)}
<text x="1050" y="519" text-anchor="middle" font-family="Arial, sans-serif" font-size="13" fill="#69513b">Actual OmniChess board geometry</text>
</svg>`;
writeFileSync(new URL('../docs/hero.svg',import.meta.url),svg);
