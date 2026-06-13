// ---------------------------------------------------------------------------
// Bootstrap + game loop + input. Drives the pure engine at a fixed timestep,
// feeds events to the renderer/sfx, and lets the UI place orders.
// ---------------------------------------------------------------------------

import './style.css';
import type { GameEvent, GameState, TeamId } from './types';
import { C, type Difficulty } from './data/constants';
import { HEROES } from './data/heroes';
import {
  newGame, randomLoadout, step, trySend, tryBuyItem, tryBuyStat,
  tryRepair, tryUpgradeKeep,
} from './engine';
import { aiThink } from './ai';
import { Renderer } from './render';
import * as ui from './ui';
import { initAudio, isMuted, setMuted, sfx } from './sfx';

type Mode = 'pick' | 'random' | 'spectate';

interface Session {
  g: GameState;
  renderer: Renderer;
  playerTeam: TeamId;
  spectate: boolean;
  paused: boolean;
  speed: number;
  speedOptions: number[];
  over: boolean;
  endShownAt: number; // real time when win fired
  mode: Mode;
  difficulty: Difficulty;
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
  const scale = Math.min(innerWidth / 1600, innerHeight / 1080);
  const ox = Math.max(0, (innerWidth - 1600 * scale) / 2);
  const oy = Math.max(0, (innerHeight - 1080 * scale) / 2);
  const tf = `translate(${ox.toFixed(1)}px, ${oy.toFixed(1)}px) scale(${scale.toFixed(4)})`;
  if (tf !== lastFit) {
    lastFit = tf;
    wrap.style.transform = tf;
  }
}
addEventListener('resize', fitScreen);
fitScreen();

// ----------------------------------------------------------------- audio

addEventListener('pointerdown', initAudio, { once: false });
addEventListener('keydown', initAudio, { once: false });

// ------------------------------------------------------------------ menu

ui.initMenu(choice => {
  if (choice.mode === 'pick') {
    ui.buildHeroSelect(
      (heroId, loadout) => startGame('pick', choice.difficulty, heroId, loadout),
      () => ui.screen('menu'),
    );
    ui.screen('select');
  } else {
    startGame(choice.mode, choice.difficulty);
  }
});
ui.screen('menu');

// ------------------------------------------------------------- start game

function startGame(mode: Mode, difficulty: Difficulty, heroId?: string, loadout?: string[]) {
  const rng = () => Math.random();
  const ids = HEROES.map(h => h.id);
  const pick = () => ids[Math.floor(Math.random() * ids.length)];

  const p0 = mode === 'pick' && heroId ? heroId : pick();
  let p1 = pick();
  if (p1 === p0 && Math.random() < 0.7) p1 = pick(); // mirrors allowed, just less often

  const g = newGame({
    heroIds: [p0, p1],
    loadouts: [
      mode === 'pick' && loadout ? loadout : randomLoadout(p0, rng),
      randomLoadout(p1, rng),
    ],
    ai: [mode === 'spectate', true],
    difficulty: mode === 'spectate' ? [difficulty, difficulty] : difficulty,
  });

  S = {
    g,
    renderer: new Renderer(canvas),
    playerTeam: 0,
    spectate: mode === 'spectate',
    paused: false,
    speed: 1,
    speedOptions: mode === 'spectate' ? [1, 2, 4, 8] : [1, 2],
    over: false,
    endShownAt: 0,
    mode, difficulty, heroId, loadout,
  };

  ui.buildHud(g, 0, makeActions(), S.spectate);
  ui.screen('game');
  ui.setPauseVeil(false);
  sfx.horn();
}

function makeActions(): ui.HudActions {
  const deny = () => ui.toast('The Fates command this war — you only watch');
  return {
    send(defId, count) {
      if (!S || S.over) return;
      if (S.spectate) return deny();
      const team = S.g.teams[S.playerTeam];
      let sent = 0;
      for (let i = 0; i < count; i++) if (trySend(S.g, team, defId)) sent++;
      if (sent > 0) sfx.coin();
    },
    buyItem(id) {
      if (!S || S.over) return;
      if (S.spectate) return deny();
      if (tryBuyItem(S.g, S.g.teams[S.playerTeam], id)) {
        sfx.coin();
        ui.refreshPanel();
      }
    },
    buyStat(key) {
      if (!S || S.over) return;
      if (S.spectate) return deny();
      if (tryBuyStat(S.g, S.g.teams[S.playerTeam], key)) sfx.coin();
    },
    upgradeKeep() {
      if (!S || S.over) return;
      if (S.spectate) return deny();
      if (tryUpgradeKeep(S.g, S.g.teams[S.playerTeam])) ui.refreshPanel();
    },
    repair() {
      if (!S || S.over) return;
      if (S.spectate) return deny();
      tryRepair(S.g, S.g.teams[S.playerTeam]);
    },
    useItem(slot) {
      if (!S || S.over || S.spectate) return;
      S.g.teams[S.playerTeam].input.useItem[slot] = true;
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
        // concede
        S.g.over = true;
        S.g.winner = (1 - S.playerTeam) as TeamId;
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
  if (S.spectate) sfx.victory();
  else if (S.g.winner === S.playerTeam) sfx.victory();
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
      if (S.spectate || S.over || S.paused) break;
      S.g.teams[S.playerTeam].input.cast[KEY_TO_SLOT[k]] = true;
      break;
    }
    case '1': case '2': case '3': case '4': case '5': case '6': {
      if (S.spectate || S.over || S.paused) break;
      S.g.teams[S.playerTeam].input.useItem[parseInt(k, 10) - 1] = true;
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
  if (!S || S.spectate) return;
  const p = canvasPos(e);
  if (p) S.g.teams[S.playerTeam].input.aim = p;
});

// click-to-move: either button on open ground is a marching order
canvas.addEventListener('mousedown', e => {
  if (!S || S.spectate || S.over || S.paused) return;
  const p = canvasPos(e);
  if (!p) return;
  e.preventDefault();
  S.g.teams[S.playerTeam].input.moveTo = p;
  S.renderer.clickMarker(p);
  sfx.click();
});
canvas.addEventListener('contextmenu', e => e.preventDefault());

function readMoveInput() {
  if (!S || S.spectate) return;
  const input = S.g.teams[S.playerTeam].input;
  let x = 0, y = 0;
  if (keys.has('a') || keys.has('arrowleft')) x -= 1;
  if (keys.has('d') || keys.has('arrowright')) x += 1;
  if (keys.has('w') || keys.has('arrowup')) y -= 1;
  if (keys.has('s') || keys.has('arrowdown')) y += 1;
  input.move = { x, y };
}

// ----------------------------------------------------------- event sounds

function playEventSfx(events: GameEvent[], playerTeam: TeamId) {
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
        if (e.kind === 'explode' || e.kind === 'slam' || e.kind === 'collapse') sfx.explode();
        else if (e.kind === 'roar') sfx.heroDeath();
        break;
      case 'send': if (e.team === playerTeam) sfx.horn(); break;
      case 'income': if (e.team === playerTeam) sfx.income(); break;
      case 'gold': if (e.team === playerTeam && e.pos) sfx.coin(); break;
      case 'levelup': if (e.team === playerTeam) sfx.levelup(); break;
      case 'forge': sfx.forge(); break;
      case 'buy': break;
      case 'castleHit': sfx.castleHit(); break;
      case 'volley': sfx.volley(); break;
      case 'repair': if (e.team === playerTeam) sfx.repair(); break;
      case 'upgrade': sfx.upgrade(); break;
      case 'heroDeath': sfx.heroDeath(); break;
      case 'heroSpawn': if (e.team === playerTeam) sfx.heroSpawn(); break;
      case 'underdog': if (e.on) sfx.underdog(); break;
      case 'twilight': sfx.twilight(); break;
      case 'deny': if (e.team === playerTeam) ui.toast(e.msg); break;
    }
  }
}

// ------------------------------------------------------------------- loop

let lastFrame = performance.now();

function frame(now: number) {
  requestAnimationFrame(frame);
  const realDt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  fitScreen(); // cheap (cached); survives missed resize events
  if (!S) return;
  const sess = S;
  const g = sess.g;

  if (!sess.paused && !g.over) {
    readMoveInput();
    let budget = realDt * sess.speed;
    let steps = 0;
    while (budget > 0 && steps < 16 && !g.over) {
      const dt = Math.min(C.DT, budget);
      if (g.teams[0].ai) aiThink(g, 0);
      if (g.teams[1].ai) aiThink(g, 1);
      step(g, dt);
      budget -= dt;
      steps++;
    }
  }

  // drain events exactly once per frame
  const events = g.events;
  g.events = [];
  if (events.length > 0) {
    sess.renderer.consume(events, g, sess.playerTeam);
    playEventSfx(events, sess.playerTeam);
    for (const e of events) {
      if (e.t === 'win' && !sess.over) finishGame();
      if (e.t === 'upgrade' && e.team === sess.playerTeam) ui.refreshPanel();
      if (e.t === 'forge' && e.team === sess.playerTeam) ui.refreshPanel();
    }
  }

  sess.renderer.draw(g, realDt, sess.playerTeam);
  ui.updateHud(g);

  // linger on the battlefield a moment, then the verdict
  if (sess.over && performance.now() - sess.endShownAt > 1600 && document.getElementById('screen-end')!.classList.contains('hidden')) {
    const again = () => {
      ui.screen('game');
      startGame(sess.mode, sess.difficulty, sess.heroId, sess.loadout);
    };
    ui.showEnd(g, sess.playerTeam, sess.spectate, again, () => {
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
