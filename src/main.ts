// ---------------------------------------------------------------------------
// Bootstrap + game loop + input. Drives the pure engine at a fixed timestep,
// feeds events to the renderer/sfx, and lets the UI place orders.
// ---------------------------------------------------------------------------

import './style.css';
import type { GameEvent, GameState, PlayerState, TeamId } from './types';
import { C, type Difficulty } from './data/constants';
import {
  allPlayers, newGame, randomHeroes, randomLoadout, step, trySend, tryBuyItem,
  trySellItem, tryBuyStat, tryRepair, tryUpgradeKeep,
} from './engine';
import { aiThink } from './ai';
import { Renderer } from './render';
import * as ui from './ui';
import { initAudio, isMuted, setMuted, sfx } from './sfx';

type Mode = 'pick' | 'random' | 'spectate';

interface Session {
  g: GameState;
  renderer: Renderer;
  human: PlayerState | null; // null in spectate
  viewTeam: TeamId;
  spectate: boolean;
  paused: boolean;
  speed: number;
  speedOptions: number[];
  over: boolean;
  endShownAt: number;
  mode: Mode;
  difficulty: Difficulty;
  teamSize: 1 | 3;
  heroId?: string;
  loadout?: string[];
}

let S: Session | null = null;
const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const keys = new Set<string>();

// ------------------------------------------------------------ screen scale

let lastFit = '';
function fitScreen() {
  const wrap = document.getElementById('game-wrap')!;
  // use the VISUAL viewport when available — excludes the mobile URL bar, so
  // the top HUD is never hidden behind browser chrome
  const vv = window.visualViewport;
  const vw = vv?.width ?? innerWidth;
  const vh = vv?.height ?? innerHeight;
  const scale = Math.min(vw / 1600, vh / 1080);
  const ox = Math.max(0, (vw - 1600 * scale) / 2);
  // anchor to the top (don't vertically center) so the HUD top bar always sits
  // at the very top of the visible area, never clipped
  const oy = Math.max(0, (vh - 1080 * scale) * 0.04);
  const tf = `translate(${ox.toFixed(1)}px, ${oy.toFixed(1)}px) scale(${scale.toFixed(4)})`;
  if (tf !== lastFit) {
    lastFit = tf;
    wrap.style.transform = tf;
  }
}
addEventListener('resize', fitScreen);
window.visualViewport?.addEventListener('resize', fitScreen);
window.visualViewport?.addEventListener('scroll', fitScreen);
fitScreen();

// ----------------------------------------------------------------- audio

addEventListener('pointerdown', initAudio, { once: false });
addEventListener('keydown', initAudio, { once: false });

// ------------------------------------------------------------------ menu

ui.initMenu(choice => {
  if (choice.mode === 'pick') {
    ui.buildHeroSelect(
      (heroId, loadout) => startGame('pick', choice.difficulty, choice.teamSize, heroId, loadout),
      () => ui.screen('menu'),
    );
    ui.screen('select');
  } else {
    startGame(choice.mode, choice.difficulty, choice.teamSize);
  }
});
ui.screen('menu');

// ------------------------------------------------------------- start game

function startGame(mode: Mode, difficulty: Difficulty, teamSize: 1 | 3, heroId?: string, loadout?: string[]) {
  const rng = () => Math.random();
  // distinct heroes across the battle; the picked hero leads team 0
  let ids = randomHeroes(rng, teamSize * 2);
  if (mode === 'pick' && heroId) {
    ids = ids.filter(id => id !== heroId);
    ids.unshift(heroId);
    ids = ids.slice(0, teamSize * 2);
  }
  const loadouts = ids.map((id, i) =>
    i === 0 && mode === 'pick' && loadout ? loadout : randomLoadout(id, rng));

  const g = newGame({
    teamSize,
    heroIds: ids,
    loadouts,
    humanPlayer: mode === 'spectate' ? -1 : 0,
    difficulty: mode === 'spectate' ? [difficulty, difficulty] : difficulty,
  });

  S = {
    g,
    renderer: new Renderer(canvas),
    human: mode === 'spectate' ? null : g.teams[0].players[0],
    viewTeam: 0,
    spectate: mode === 'spectate',
    paused: false,
    speed: 1,
    speedOptions: mode === 'spectate' ? [1, 2, 4, 8] : [1, 2],
    over: false,
    endShownAt: 0,
    mode, difficulty, teamSize, heroId, loadout,
  };

  ui.buildHud(g, S.human ? S.human.id : g.teams[0].players[0].id, makeActions(), S.spectate);
  ui.screen('game');
  ui.setPauseVeil(false);
  sfx.horn();
}

function makeActions(): ui.HudActions {
  const deny = () => ui.toast('The Fates command this war — you only watch');
  return {
    send(defId, count) {
      if (!S || S.over) return;
      if (!S.human) return deny();
      let sent = 0;
      for (let i = 0; i < count; i++) if (trySend(S.g, S.human, defId)) sent++;
      if (sent > 0) sfx.coin();
    },
    buyItem(id) {
      if (!S || S.over) return;
      if (!S.human) return deny();
      if (tryBuyItem(S.g, S.human, id)) {
        sfx.coin();
        ui.refreshPanel();
      }
    },
    buyStat(key) {
      if (!S || S.over) return;
      if (!S.human) return deny();
      if (tryBuyStat(S.g, S.human, key)) sfx.coin();
    },
    upgradeKeep() {
      if (!S || S.over) return;
      if (!S.human) return deny();
      if (tryUpgradeKeep(S.g, S.human)) ui.refreshPanel();
    },
    repair() {
      if (!S || S.over) return;
      if (!S.human) return deny();
      tryRepair(S.g, S.human);
    },
    useItem(slot) {
      if (!S || S.over || !S.human) return;
      S.human.input.useItem[slot] = true;
    },
    sellItem(slot) {
      if (!S || S.over || !S.human) return;
      if (trySellItem(S.g, S.human, slot)) { sfx.coin(); ui.refreshPanel(); }
    },
    togglePause() {
      if (!S || S.over) return;
      S.paused = !S.paused;
      ui.setPauseVeil(S.paused);
    },
    toggleMute() {
      setMuted(!isMuted());
      return isMuted();
    },
    setSpeed() {
      if (!S) return 1;
      const idx = S.speedOptions.indexOf(S.speed);
      S.speed = S.speedOptions[(idx + 1) % S.speedOptions.length];
      return S.speed;
    },
    quit() {
      if (!S) return;
      if (!S.over && !S.spectate) {
        S.g.over = true;
        S.g.winner = 1;
        finishGame();
      } else {
        S = null;
        ui.screen('menu');
      }
    },
  };
}

function finishGame() {
  if (!S) return;
  S.over = true;
  S.endShownAt = performance.now();
  if (S.spectate || S.g.winner === 0) sfx.victory();
  else sfx.defeat();
}

// ------------------------------------------------------------------ input

const KEY_TO_SLOT: Record<string, number> = { q: 0, e: 1, f: 2, r: 3 };

addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (!S || document.getElementById('screen-game')!.classList.contains('hidden')) return;
  if (e.repeat) {
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) keys.add(k);
    return;
  }
  switch (k) {
    case 'w': case 'a': case 's': case 'd':
    case 'arrowup': case 'arrowdown': case 'arrowleft': case 'arrowright':
      keys.add(k);
      e.preventDefault();
      break;
    case 'q': case 'e': case 'f': case 'r': {
      if (!S.human || S.over || S.paused) break;
      S.human.input.cast[KEY_TO_SLOT[k]] = true;
      break;
    }
    case '1': case '2': case '3': case '4': case '5': case '6': {
      if (!S.human || S.over || S.paused) break;
      S.human.input.useItem[parseInt(k, 10) - 1] = true;
      break;
    }
    case 'b': ui.togglePanel('barracks'); sfx.click(); break;
    case 'g': ui.togglePanel('forge'); sfx.click(); break;
    case 'v': ui.togglePanel('council'); sfx.click(); break;
    case 'p': if (!S.over) { S.paused = !S.paused; ui.setPauseVeil(S.paused); } break;
    case 'm': setMuted(!isMuted()); break;
    case 'escape':
      if (ui.currentPanel()) ui.closePanel();
      else if (!S.over) { S.paused = !S.paused; ui.setPauseVeil(S.paused); }
      break;
  }
});
addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => keys.clear());

function canvasPos(e: MouseEvent): { x: number; y: number } | null {
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0) return null;
  const x = ((e.clientX - rect.left) / rect.width) * C.W;
  const y = ((e.clientY - rect.top) / rect.height) * C.H;
  if (x < 0 || x > C.W || y < 0 || y > C.H) return null;
  return { x, y };
}

addEventListener('mousemove', e => {
  if (!S || !S.human) return;
  const p = canvasPos(e);
  if (p) S.human.input.aim = p;
});

// click-to-move: either button on open ground is a marching order
canvas.addEventListener('mousedown', e => {
  if (!S || !S.human || S.over || S.paused) return;
  const p = canvasPos(e);
  if (!p) return;
  e.preventDefault();
  S.human.input.moveTo = p;
  S.renderer.clickMarker(p);
  sfx.click();
});
canvas.addEventListener('contextmenu', e => e.preventDefault());

function readMoveInput() {
  if (!S || !S.human) return;
  const input = S.human.input;
  let x = 0, y = 0;
  if (keys.has('a') || keys.has('arrowleft')) x -= 1;
  if (keys.has('d') || keys.has('arrowright')) x += 1;
  if (keys.has('w') || keys.has('arrowup')) y -= 1;
  if (keys.has('s') || keys.has('arrowdown')) y += 1;
  input.move = { x, y };
}

// ----------------------------------------------------------- event sounds

function playEventSfx(events: GameEvent[], humanTeam: TeamId, humanId: number) {
  for (const e of events) {
    switch (e.t) {
      case 'dmg':
        if (e.target === 'hero') sfx.hit();
        break;
      case 'death': {
        if (e.tier === 3) sfx.bigDeath(); else sfx.death();
        break;
      }
      case 'cast': e.ult ? sfx.ult() : sfx.cast(); break;
      case 'impact':
        if (e.kind === 'explode' || e.kind === 'slam' || e.kind === 'collapse' || e.kind === 'anvilhit') sfx.explode();
        else if (e.kind === 'roar') sfx.heroDeath();
        else if (e.kind === 'bolt') sfx.cast();
        break;
      case 'send': if (e.team === humanTeam) sfx.horn(); break;
      case 'income': if (e.player === humanId) sfx.income(); break;
      case 'gold': if (e.player === humanId && e.pos) sfx.coin(); break;
      case 'levelup': if (e.player === humanId) sfx.levelup(); break;
      case 'forge': sfx.forge(); break;
      case 'buy': break;
      case 'sell':
        if (e.player === humanId) ui.toast(`Sold for ${e.refund}g`);
        break;
      case 'castleHit': sfx.castleHit(); break;
      case 'volley': sfx.volley(); break;
      case 'repair': if (e.team === humanTeam) sfx.repair(); break;
      case 'upgrade': sfx.upgrade(); break;
      case 'heroDeath': sfx.heroDeath(); break;
      case 'heroSpawn': if (e.team === humanTeam) sfx.heroSpawn(); break;
      case 'underdog': if (e.on) sfx.underdog(); break;
      case 'twilight': sfx.twilight(); break;
      case 'tower': if (e.team === humanTeam) sfx.forge(); break;
      case 'runeGet': if (e.player === humanId) { e.kind === 'bounty' ? sfx.income() : sfx.levelup(); } break;
      case 'forgeMastery': if (e.complete) sfx.victory(); break;
      case 'deny': if (e.player === humanId) ui.toast(e.msg); break;
    }
  }
}

// ------------------------------------------------------------------- loop

let lastFrame = performance.now();

function frame(now: number) {
  requestAnimationFrame(frame);
  const realDt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  fitScreen();
  if (!S) return;
  const sess = S;
  const g = sess.g;

  if (!sess.paused && !g.over) {
    readMoveInput();
    let budget = realDt * sess.speed;
    let steps = 0;
    while (budget > 0 && steps < 16 && !g.over) {
      const dt = Math.min(C.DT, budget);
      for (const pl of allPlayers(g)) if (pl.ai) aiThink(g, pl);
      step(g, dt);
      budget -= dt;
      steps++;
    }
  }

  const events = g.events;
  g.events = [];
  if (events.length > 0) {
    sess.renderer.consume(events, g, sess.viewTeam);
    playEventSfx(events, sess.human ? sess.human.team : 0, sess.human ? sess.human.id : -1);
    for (const e of events) {
      if (e.t === 'win' && !sess.over) finishGame();
      if ((e.t === 'upgrade' || e.t === 'forge') && sess.human && e.team === sess.human.team) ui.refreshPanel();
    }
  }

  sess.renderer.draw(g, realDt, sess.viewTeam);
  ui.updateHud(g);

  if (sess.over && performance.now() - sess.endShownAt > 1600 && document.getElementById('screen-end')!.classList.contains('hidden')) {
    const again = () => {
      startGame(sess.mode, sess.difficulty, sess.teamSize, sess.heroId, sess.loadout);
    };
    ui.showEnd(g, sess.human ? sess.human.team : 0, sess.spectate, again, () => {
      S = null;
      ui.screen('menu');
    });
  }
}
requestAnimationFrame(frame);

// debug handle (used by the verification harness; harmless in production)
(window as any).__hlw = {
  get state() { return S; },
  start: startGame,
};
