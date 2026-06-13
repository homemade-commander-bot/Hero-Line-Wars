// ---------------------------------------------------------------------------
// DOM chrome: menus, hero select, HUD, shops, tooltips, end screen.
// The canvas does the violence; this file does the bookkeeping.
// ---------------------------------------------------------------------------

import type { GameState, PlayerState, TeamId } from './types';
import { C, DIFFICULTY, type Difficulty, xpNeed } from './data/constants';
import { ABILITY_BY_ID, ATTR_COLOR, ATTR_LABEL, HEROES, HERO_BY_ID } from './data/heroes';
import { UNITS, UNIT_BY_ID } from './data/units';
import { BASIC_ITEMS, FORGED_ITEMS, ITEM_BY_ID } from './data/items';
import { abilityOf, playerById, repairCost, sellValue, statCost } from './engine';
import { abilityIconCanvas, heroPortraitCanvas, itemIconCanvas, unitIconCanvas } from './render';
import { sfx } from './sfx';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}
const $ = (id: string) => document.getElementById(id)!;

// ------------------------------------------------------------------ tooltip

const ttDiv = () => $('tooltip');
const ttMap = new WeakMap<HTMLElement, () => string>();

export function bindTooltip(elm: HTMLElement, html: () => string) {
  ttMap.set(elm, html);
  elm.addEventListener('mouseenter', () => {
    const fn = ttMap.get(elm);
    if (!fn) return;
    const tt = ttDiv();
    tt.innerHTML = fn();
    tt.classList.remove('hidden');
  });
  elm.addEventListener('mouseleave', () => ttDiv().classList.add('hidden'));
}
document.addEventListener('mousemove', e => {
  const tt = ttDiv();
  if (tt.classList.contains('hidden')) return;
  const pad = 18;
  let x = e.clientX + pad, y = e.clientY + pad;
  const r = tt.getBoundingClientRect();
  if (x + r.width > innerWidth - 8) x = e.clientX - r.width - pad;
  if (y + r.height > innerHeight - 8) y = e.clientY - r.height - pad;
  tt.style.left = `${x}px`;
  tt.style.top = `${y}px`;
});

export function screen(name: 'menu' | 'select' | 'game' | 'end') {
  for (const s of ['menu', 'select', 'game', 'end']) {
    $(`screen-${s}`).classList.toggle('hidden', s !== name);
  }
}

// ------------------------------------------------------------------- toasts

let lastToast = '';
let lastToastAt = 0;
export function toast(msg: string) {
  const now = performance.now();
  if (msg === lastToast && now - lastToastAt < 900) return;
  lastToast = msg; lastToastAt = now;
  const box = $('toasts');
  const t = el('div', 'toast', msg);
  box.appendChild(t);
  setTimeout(() => t.remove(), 1700);
  sfx.deny();
}

// ------------------------------------------------------------------- menu

export interface MenuChoice {
  mode: 'pick' | 'random' | 'spectate';
  difficulty: Difficulty;
  teamSize: 1 | 3;
}

export function initMenu(onChoose: (c: MenuChoice) => void) {
  let difficulty: Difficulty = (localStorage.getItem('hlw-diff') as Difficulty) || 'knight';
  let teamSize: 1 | 3 = localStorage.getItem('hlw-teamsize') === '3' ? 3 : 1;
  const picker = $('diff-picker');
  picker.innerHTML = '';
  for (const key of ['squire', 'knight', 'warlord'] as Difficulty[]) {
    const d = DIFFICULTY[key];
    const b = el('button', `diff-btn${key === difficulty ? ' active' : ''}`, d.label);
    b.dataset.group = 'diff';
    bindTooltip(b, () => `<div class="tt-title">${d.label}</div><div class="tt-body">${d.desc}</div>`);
    b.onclick = () => {
      difficulty = key;
      localStorage.setItem('hlw-diff', key);
      picker.querySelectorAll('[data-group="diff"]').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      sfx.click();
    };
    picker.appendChild(b);
  }
  // battle size picker
  const sizeRow = $('size-picker');
  sizeRow.innerHTML = '';
  for (const [val, label, desc] of [[1, 'Duel · 1v1', 'You against one enemy warlord.'], [3, 'Warbands · 3v3', 'You and two AI allies against three enemy commanders. Shared castle, your own gold.']] as const) {
    const b = el('button', `diff-btn${teamSize === val ? ' active' : ''}`, label);
    b.dataset.group = 'size';
    bindTooltip(b, () => `<div class="tt-body">${desc}</div>`);
    b.onclick = () => {
      teamSize = val as 1 | 3;
      localStorage.setItem('hlw-teamsize', String(val));
      sizeRow.querySelectorAll('[data-group="size"]').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      sfx.click();
    };
    sizeRow.appendChild(b);
  }
  $('btn-pick').onclick = () => { sfx.click(); onChoose({ mode: 'pick', difficulty, teamSize }); };
  $('btn-random').onclick = () => { sfx.click(); onChoose({ mode: 'random', difficulty, teamSize }); };
  $('btn-spectate').onclick = () => { sfx.click(); onChoose({ mode: 'spectate', difficulty, teamSize }); };
  $('btn-howto').onclick = () => { sfx.click(); $('howto-modal').classList.remove('hidden'); };
  $('btn-howto-close').onclick = () => { sfx.click(); $('howto-modal').classList.add('hidden'); };
}

// -------------------------------------------------------------- hero select

export function buildHeroSelect(onStart: (heroId: string, loadout: string[]) => void, onBack: () => void) {
  const root = $('screen-select');
  root.innerHTML = '';
  let heroId = HEROES[0].id;
  const picks: Record<string, string[]> = {};
  for (const h of HEROES) picks[h.id] = h.slots.map(s => s[0].id);

  const wrap = el('div', 'select-wrap');
  wrap.appendChild(el('div', 'select-title', 'CHOOSE YOUR CHAMPION'));
  const list = el('div', 'hero-list');
  const detail = el('div', 'hero-detail');
  wrap.appendChild(list);
  wrap.appendChild(detail);
  root.appendChild(wrap);

  const cards: Record<string, HTMLElement> = {};
  for (const h of HEROES) {
    const card = el('div', 'hero-card');
    card.appendChild(heroPortraitCanvas(h.id, 56));
    const mid = el('div');
    mid.appendChild(el('div', 'hc-name', h.name));
    mid.appendChild(el('div', 'hc-epithet', h.epithet));
    const attr = el('div', 'hc-attr', `◆ ${ATTR_LABEL[h.attr].toUpperCase()}`);
    attr.style.color = ATTR_COLOR[h.attr];
    mid.appendChild(attr);
    card.appendChild(mid);
    card.onclick = () => { heroId = h.id; sfx.click(); renderDetail(); };
    cards[h.id] = card;
    list.appendChild(card);
  }

  function renderDetail() {
    for (const [id, c] of Object.entries(cards)) c.classList.toggle('active', id === heroId);
    const h = HERO_BY_ID[heroId];
    detail.innerHTML = '';
    const head = el('div', 'hd-head');
    head.appendChild(heroPortraitCanvas(h.id, 92));
    const hh = el('div');
    hh.appendChild(el('div', 'hd-name', h.name));
    hh.appendChild(el('div', 'hd-epithet', `${h.epithet} — <span style="color:${ATTR_COLOR[h.attr]}">${ATTR_LABEL[h.attr]}</span>`));
    const st = el('div', 'hd-stats');
    st.innerHTML =
      `<span>STR <b>${h.base.str}</b> +${h.growth.str}/lvl</span>` +
      `<span>AGI <b>${h.base.agi}</b> +${h.growth.agi}/lvl</span>` +
      `<span>INT <b>${h.base.int}</b> +${h.growth.int}/lvl</span>` +
      `<span>Range <b>${h.atkRange > 200 ? 'Ranged' : 'Melee'}</b></span>`;
    hh.appendChild(st);
    head.appendChild(hh);
    detail.appendChild(head);
    detail.appendChild(el('div', 'hd-blurb', h.blurb));

    h.slots.forEach((opts, si) => {
      const row = el('div', 'slot-row');
      row.appendChild(el('h4', undefined, `${opts[0].cat.toUpperCase()} — choose one`));
      const grid = el('div', 'slot-opts');
      for (const ab of opts) {
        const card = el('div', `ab-card${picks[h.id][si] === ab.id ? ' active' : ''}`);
        card.appendChild(abilityIconCanvas(ab, 44));
        const mid = el('div');
        mid.appendChild(el('div', 'ab-name', ab.name));
        mid.appendChild(el('div', 'ab-desc', ab.desc));
        mid.appendChild(el('div', 'ab-meta', `${ab.cd}s cd · ${ab.mana} mana`));
        card.appendChild(mid);
        card.onclick = () => { picks[h.id][si] = ab.id; sfx.click(); renderDetail(); };
        grid.appendChild(card);
      }
      row.appendChild(grid);
      detail.appendChild(row);
    });

    const ultRow = el('div', 'slot-row');
    ultRow.appendChild(el('h4', undefined, 'ULTIMATE — forged into their soul (unlocks at level 6)'));
    const ug = el('div');
    const uc = el('div', 'ab-card ult');
    uc.appendChild(abilityIconCanvas(h.ult, 52));
    const um = el('div');
    um.appendChild(el('div', 'ab-name', `★ ${h.ult.name}`));
    um.appendChild(el('div', 'ab-desc', h.ult.desc));
    um.appendChild(el('div', 'ab-meta', `${h.ult.cd}s cd · ${h.ult.mana} mana`));
    uc.appendChild(um);
    ug.appendChild(uc);
    ultRow.appendChild(ug);
    detail.appendChild(ultRow);

    const actions = el('div', 'select-actions');
    const back = el('button', 'btn', '← Back');
    back.onclick = () => { sfx.click(); onBack(); };
    const rand = el('button', 'btn', '🎲 Random loadout');
    rand.onclick = () => {
      picks[h.id] = h.slots.map(s => s[Math.floor(Math.random() * s.length)].id);
      sfx.click();
      renderDetail();
    };
    const go = el('button', 'btn btn-primary', '⚔ BEGIN THE WAR');
    go.onclick = () => { sfx.horn(); onStart(heroId, picks[heroId]); };
    actions.appendChild(back);
    actions.appendChild(rand);
    actions.appendChild(go);
    detail.appendChild(actions);
  }
  renderDetail();
}

// ------------------------------------------------------------------- HUD

export interface HudActions {
  send(defId: string, count: number): void;
  buyItem(id: string): void;
  buyStat(key: 'str' | 'agi' | 'int' | 'dmg' | 'armor'): void;
  upgradeKeep(): void;
  repair(): void;
  useItem(slot: number): void;
  sellItem(slot: number): void;
  togglePause(): void;
  toggleMute(): boolean;
  setSpeed(n: number): number;
  quit(): void;
}

interface HudRefs {
  castleFill: HTMLElement[]; castleText: HTMLElement[]; castleName: HTMLElement[]; castleBadges: HTMLElement[];
  intelRows: HTMLElement[]; // per team: commander portraits + items
  gold: HTMLElement; income: HTMLElement; clock: HTMLElement; twilight: HTMLElement;
  hpFill: HTMLElement; hpText: HTMLElement; mpFill: HTMLElement; mpText: HTMLElement;
  level: HTMLElement; xp: HTMLElement; statsLine: HTMLElement;
  abSlots: { veil: HTMLElement; slot: HTMLElement; mana: HTMLElement }[];
  itemSlots: HTMLElement[];
  queueBar: HTMLElement | null;
  portraitBox: HTMLElement;
  speedBtn: HTMLElement;
  muteBtn: HTMLElement;
}
let R: HudRefs | null = null;
let panelTab: 'barracks' | 'forge' | 'council' | null = null;
let panelRefreshAt = 0;
let hudGame: GameState | null = null;
let hudPlayerId = 0;
let hudActions: HudActions | null = null;
let spectate = false;
let intelSig = ['', ''];

const ABILITY_KEYS = ['Q', 'E', 'F', 'R'];

function hudPlayer(): PlayerState {
  return playerById(hudGame!, hudPlayerId);
}

export function buildHud(g: GameState, playerId: number, actions: HudActions, isSpectate: boolean) {
  hudGame = g; hudPlayerId = playerId; hudActions = actions; spectate = isSpectate;
  panelTab = null;
  intelSig = ['', ''];
  lastItemSig = '';
  $('side-panel').classList.add('hidden');
  $('pause-veil').classList.add('hidden');

  const me = hudPlayer();
  const hero = me.hero;
  const hdef = HERO_BY_ID[hero.defId];

  // ----------------------------------------------------------- top bar
  const top = $('hud-top');
  top.innerHTML = '';
  const refs: Partial<HudRefs> = { castleFill: [], castleText: [], castleName: [], castleBadges: [], intelRows: [], abSlots: [], itemSlots: [] };

  const sides: HTMLElement[] = [];
  for (const team of [0, 1] as TeamId[]) {
    const cs = el('div', 'castle-status');
    const name = el('div', 'cs-name');
    cs.appendChild(name);
    const bar = el('div', 'cs-bar');
    const fill = el('div', 'cs-fill');
    fill.style.background = team === 0 ? 'linear-gradient(90deg,#2e5a9a,#7db8ff)' : 'linear-gradient(90deg,#9a2e3e,#ff7a5c)';
    const txt = el('div', 'cs-text');
    bar.appendChild(fill); bar.appendChild(txt);
    cs.appendChild(bar);
    const badges = el('div', 'cs-badges');
    cs.appendChild(badges);
    const intel = el('div', 'cs-intel');
    cs.appendChild(intel);
    refs.castleFill![team] = fill;
    refs.castleText![team] = txt;
    refs.castleName![team] = name;
    refs.castleBadges![team] = badges;
    refs.intelRows![team] = intel;
    sides[team] = cs;
  }

  const center = el('div', 'top-center');
  const gold = el('div', 'top-gold');
  const income = el('div', 'top-income');
  const clock = el('div', 'top-clock');
  const twilight = el('div', 'top-twilight');
  center.append(gold, income, clock, twilight);
  refs.gold = gold;
  refs.income = income;
  refs.clock = clock;
  refs.twilight = twilight;

  top.appendChild(sides[0]);
  top.appendChild(center);
  top.appendChild(sides[1]);

  const btns = el('div', 'top-buttons');
  const speedBtn = el('button', 'btn btn-tiny', '1×');
  speedBtn.onclick = () => { const s = actions.setSpeed(0); speedBtn.textContent = `${s}×`; sfx.click(); };
  bindTooltip(speedBtn, () => '<div class="tt-body">Game speed</div>');
  const pauseBtn = el('button', 'btn btn-tiny', '⏸');
  pauseBtn.onclick = () => { actions.togglePause(); sfx.click(); };
  const muteBtn = el('button', 'btn btn-tiny', '🔊');
  muteBtn.onclick = () => { muteBtn.textContent = actions.toggleMute() ? '🔇' : '🔊'; };
  const quitBtn = el('button', 'btn btn-tiny', '⚐ Concede');
  quitBtn.onclick = () => { sfx.click(); actions.quit(); };
  btns.append(speedBtn, pauseBtn, muteBtn, quitBtn);
  top.appendChild(btns);
  refs.speedBtn = speedBtn;
  refs.muteBtn = muteBtn;

  // --------------------------------------------------------- bottom bar
  const bottom = $('hud-bottom');
  bottom.innerHTML = '';

  const pbox = el('div', 'hb-portrait');
  pbox.appendChild(heroPortraitCanvas(hero.defId, 96));
  const lvl = el('div', 'hb-level', '1');
  const xp = el('div', 'hb-xp');
  const xpFill = el('div');
  xp.appendChild(xpFill);
  pbox.append(lvl, xp);
  bottom.appendChild(pbox);
  refs.level = lvl;
  refs.xp = xpFill;
  refs.portraitBox = pbox;

  const vitals = el('div', 'hb-vitals');
  vitals.appendChild(el('div', 'hb-name', `${hdef.name} <span style="color:#9a8fc4;font-size:13px">${hdef.epithet}</span>`));
  const hpBar = el('div', 'vital-bar hp');
  const hpFill = el('div', 'vb-fill');
  const hpText = el('div', 'vb-text');
  hpBar.append(hpFill, hpText);
  const mpBar = el('div', 'vital-bar mp');
  const mpFill = el('div', 'vb-fill');
  const mpText = el('div', 'vb-text');
  mpBar.append(mpFill, mpText);
  const statsLine = el('div', 'hb-stats');
  vitals.append(hpBar, mpBar, statsLine);
  bottom.appendChild(vitals);
  refs.hpFill = hpFill; refs.hpText = hpText; refs.mpFill = mpFill; refs.mpText = mpText; refs.statsLine = statsLine;

  const abs = el('div', 'hb-abilities');
  for (let i = 0; i < 4; i++) {
    const ab = ABILITY_BY_ID[hero.loadout[i]];
    const slot = el('div', `ab-slot${i === 3 ? ' ult-slot' : ''}`);
    slot.appendChild(abilityIconCanvas(ab, 64));
    slot.appendChild(el('div', 'key', ABILITY_KEYS[i]));
    const mana = el('div', 'mana', String(ab.mana));
    slot.appendChild(mana);
    const veil = el('div', 'cd-veil hidden');
    slot.appendChild(veil);
    bindTooltip(slot, () => {
      const a = ABILITY_BY_ID[hudPlayer().hero.loadout[i]];
      return `<div class="tt-title">${a.name}</div><div class="tt-sub">${a.cat}${i === 3 ? ' · unlocks at level ' + C.ULT_LEVEL : ''}</div>` +
        `<div class="tt-body">${a.desc}</div><div class="tt-meta">${a.cd}s cooldown · ${a.mana} mana · key <b>${ABILITY_KEYS[i]}</b></div>`;
    });
    abs.appendChild(slot);
    refs.abSlots!.push({ veil, slot, mana });
  }
  bottom.appendChild(abs);

  const items = el('div', 'hb-items');
  for (let i = 0; i < 6; i++) {
    const s = el('div', 'item-slot');
    s.appendChild(el('div', 'key', String(i + 1)));
    s.onclick = () => actions.useItem(i);
    s.oncontextmenu = (ev) => { ev.preventDefault(); actions.sellItem(i); };
    items.appendChild(s);
    refs.itemSlots!.push(s);
  }
  bottom.appendChild(items);

  const right = el('div', 'hb-right');
  const bBar = el('button', 'btn', '⚔ Barracks <kbd>B</kbd>');
  bBar.onclick = () => { sfx.click(); togglePanel('barracks'); };
  const bForge = el('button', 'btn', '⚒ Forge <kbd>G</kbd>');
  bForge.onclick = () => { sfx.click(); togglePanel('forge'); };
  const bCouncil = el('button', 'btn', '♜ War Council <kbd>V</kbd>');
  bCouncil.onclick = () => { sfx.click(); togglePanel('council'); };
  right.append(bBar, bForge, bCouncil);
  right.appendChild(el('div', 'hint', spectate ? 'Watching the war unfold…' : 'Click to move. Send monsters. Grow rich.'));
  bottom.appendChild(right);

  R = refs as HudRefs;
  R.queueBar = null;
}

export function togglePanel(tab: 'barracks' | 'forge' | 'council') {
  const panel = $('side-panel');
  if (panelTab === tab) {
    panelTab = null;
    panel.classList.add('hidden');
    return;
  }
  panelTab = tab;
  panel.classList.remove('hidden');
  renderPanel();
}
export function closePanel() {
  panelTab = null;
  $('side-panel').classList.add('hidden');
}
export function currentPanel() { return panelTab; }

function renderPanel() {
  const g = hudGame!;
  const me = hudPlayer();
  const actions = hudActions!;
  const panel = $('side-panel');
  panel.innerHTML = '';

  const tabs = el('div', 'sp-tabs');
  for (const t of ['barracks', 'forge', 'council'] as const) {
    const tb = el('div', `sp-tab${panelTab === t ? ' active' : ''}`, t === 'barracks' ? '⚔ BARRACKS' : t === 'forge' ? '⚒ FORGE' : '♜ COUNCIL');
    tb.onclick = () => { sfx.click(); panelTab = t; renderPanel(); };
    tabs.appendChild(tb);
  }
  panel.appendChild(tabs);
  const body = el('div', 'sp-body');
  panel.appendChild(body);

  if (panelTab === 'barracks') {
    const queue = el('div', 'queue-bar');
    body.appendChild(queue);
    R!.queueBar = queue;
    for (const tier of [1, 2, 3]) {
      const locked = me.baseLevel < tier;
      const head = el('div', 'tier-head',
        `<span>TIER ${'I'.repeat(tier)}</span>${locked ? `<span class="locked">🔒 requires Keep ${'I'.repeat(tier)}</span>` : ''}`);
      body.appendChild(head);
      const grid = el('div', 'unit-grid');
      for (const u of UNITS.filter(x => x.tier === tier)) {
        const card = el('div', `unit-card${locked ? ' locked' : ''}`);
        card.dataset.unit = u.id;
        card.appendChild(unitIconCanvas(u.id, 44));
        const mid = el('div', 'uc-mid');
        mid.appendChild(el('div', 'uc-name', u.name + (u.legendary ? ' ⚜' : '')));
        mid.appendChild(el('div', 'uc-trait', u.trait));
        card.appendChild(mid);
        const right = el('div', 'uc-right');
        right.appendChild(el('div', 'uc-cost', `${u.cost}g`));
        right.appendChild(el('div', 'uc-inc', `+${u.income}/30s`));
        card.appendChild(right);
        bindTooltip(card, () =>
          `<div class="tt-title">${u.name}</div>` +
          `<div class="tt-sub">Tier ${u.tier}${u.flying ? ' · Flying' : ''}${u.legendary ? ' · LEGENDARY' : ''}</div>` +
          `<div class="tt-body">${u.trait}</div>` +
          `<div class="tt-meta">${u.hp} hp · ${u.dmg} dmg · cost ${u.cost}g · <span style="color:#7df3a0">+${u.income} income (${(u.income / u.cost * 100).toFixed(1)}g per 100g)</span><br/>Click to send · Shift-click ×5</div>`);
        card.onclick = (ev) => {
          if (locked) { toast(`Requires Keep ${'I'.repeat(tier)}`); return; }
          actions.send(u.id, ev.shiftKey ? 5 : 1);
        };
        grid.appendChild(card);
      }
      body.appendChild(grid);
    }
  }

  if (panelTab === 'forge') {
    const goldLine = el('div', 'sp-gold');
    body.appendChild(goldLine);
    R!.queueBar = goldLine;
    const grid = el('div', 'shop-grid');
    const myItems = me.hero.items.filter(Boolean).map(i => i!.defId);
    for (const it of BASIC_ITEMS) {
      const card = el('div', 'shop-item');
      card.dataset.item = it.id;
      const hums = FORGED_ITEMS.some(f =>
        f.components!.includes(it.id) &&
        f.components!.some(c => c !== it.id && myItems.includes(c)));
      if (hums) card.classList.add('humming');
      card.appendChild(itemIconCanvas(it, 38));
      const mid = el('div');
      mid.appendChild(el('div', 'si-name', it.name));
      mid.appendChild(el('div', 'si-cost', `${it.cost}g`));
      card.appendChild(mid);
      bindTooltip(card, () =>
        `<div class="tt-title">${it.name}</div><div class="tt-body">${it.desc}</div>` +
        (hums ? '<div class="tt-flavor">The forge hums as you pass…</div>' : ''));
      card.onclick = () => actions.buyItem(it.id);
      grid.appendChild(card);
    }
    body.appendChild(grid);

    // team forge-mastery progress + favor
    const done = g.discovered[me.team].length;
    const total = FORGED_ITEMS.length;
    const mastery = el('div', 'forge-mastery');
    mastery.innerHTML =
      `<div class="fm-head"><span>WARBAND FORGE-MASTERY</span><span>${done}/${total}</span></div>` +
      `<div class="fm-bar"><div class="fm-fill" style="width:${(done / total) * 100}%"></div></div>` +
      `<div class="fm-note">${g.teams[me.team].forgeComplete
        ? "★ The Forgemaster's Favor is yours — every commander tempered (+6 all stats), the castle fortified."
        : `Each recipe your warband forges grants the whole team <b>+${Math.round(C.FORGE_INCOME_PER * 100)}% income</b>. Forge all ${total} for the Forgemaster's Favor.`}</div>`;
    body.appendChild(mastery);

    const book = el('div', 'riddle-book');
    book.appendChild(el('h4', undefined, "⚒ THE FORGEMASTER'S RIDDLES"));
    for (const f of FORGED_ITEMS) {
      const solved = g.discovered[me.team].includes(f.id);
      const row = el('div', `riddle${solved ? ' solved' : ''}`);
      const icon = el('div', 'r-icon');
      if (solved) icon.appendChild(itemIconCanvas(f, 34));
      else icon.textContent = '?';
      row.appendChild(icon);
      row.appendChild(el('div', 'r-text', `“${f.riddle}”`));
      if (solved) {
        bindTooltip(row, () => {
          const stats = Object.entries(f.stats).map(([k, v]) => statLabel(k, v as number)).join(' · ');
          return `<div class="tt-title">${f.name}</div><div class="tt-body">${stats}<br/>${f.procText ?? ''}</div><div class="tt-flavor">${f.desc}</div>`;
        });
      }
      book.appendChild(row);
    }
    book.appendChild(el('div', 'forge-note', 'The forge combines what belongs together — unbidden, unexplained, no refunds.'));
    body.appendChild(book);
  }

  if (panelTab === 'council') {
    R!.queueBar = null;
    const keep = el('div', 'keep-card');
    keep.appendChild(el('h4', undefined, `YOUR KEEP ${'I'.repeat(me.baseLevel)}`));
    if (me.baseLevel < 3) {
      const next = me.baseLevel + 1;
      keep.appendChild(el('div', 'kc-desc',
        `Upgrade to Keep ${'I'.repeat(next)}: unlock <b>Tier ${'I'.repeat(next)}</b> monsters and a faster gate. ` +
        `The first commander on the team to reach a tier also adds +${C.KEEP_HP_BONUS[next]} castle hp (+${C.KEEP_HEAL[next]} restored) and sharper castle archers.`));
      const b = el('button', 'btn btn-primary', `Upgrade — ${C.KEEP_COSTS[next]}g`);
      b.onclick = () => actions.upgradeKeep();
      keep.appendChild(b);
    } else {
      keep.appendChild(el('div', 'kc-desc', 'Your Keep stands at its full height. The gate hungers.'));
    }
    body.appendChild(keep);

    const rep = el('div', 'council-row');
    rep.appendChild(el('div', undefined, `<div class="cr-label">Repair the Walls</div><div class="cr-sub">+${C.REPAIR_AMOUNT} castle hp · cost rises each time</div>`));
    const repBtn = el('button', 'btn btn-tiny', `${repairCost(me)}g`);
    repBtn.dataset.role = 'repair';
    repBtn.onclick = () => actions.repair();
    rep.appendChild(repBtn);
    body.appendChild(rep);

    body.appendChild(el('div', 'tier-head', '<span>TRAINING — permanent, this battle</span>'));
    const rows: [string, 'str' | 'agi' | 'int' | 'dmg' | 'armor', string][] = [
      [`+${C.STAT_GAIN} Strength`, 'str', 'health & regeneration'],
      [`+${C.STAT_GAIN} Agility`, 'agi', 'attack speed & armor'],
      [`+${C.STAT_GAIN} Intellect`, 'int', 'mana & spell power'],
      [`+${C.DMG_GAIN} Attack Damage`, 'dmg', 'pure violence'],
      [`+${C.ARMOR_GAIN} Armor`, 'armor', 'pure stubbornness'],
    ];
    for (const [label, key, sub] of rows) {
      const row = el('div', 'council-row');
      const left = el('div', undefined, `<div class="cr-label">${label} <span class="cr-sub" data-count="${key}">(${me.statUp[key]}/${C.STAT_CAP})</span></div><div class="cr-sub">${sub}</div>`);
      row.appendChild(left);
      const b = el('button', 'btn btn-tiny', `${statCost(me, key)}g`);
      b.dataset.role = `stat-${key}`;
      b.onclick = () => actions.buyStat(key);
      row.appendChild(b);
      body.appendChild(row);
    }
  }
}

export function refreshPanel() {
  if (panelTab) renderPanel();
}

function statLabel(k: string, v: number): string {
  switch (k) {
    case 'dmg': return `+${v} dmg`;
    case 'armor': return `+${v} armor`;
    case 'hp': return `+${v} hp`;
    case 'as': return `+${Math.round(v * 100)}% atk speed`;
    case 'ms': return `+${Math.round(v * 100)}% move speed`;
    case 'sp': return `+${v} spell power`;
    case 'regen': return `+${v} hp/s`;
    case 'manaRegen': return `+${v} mana/s`;
    case 'cdr': return `+${Math.round(v * 100)}% cdr`;
    case 'lifesteal': return `+${Math.round(v * 100)}% lifesteal`;
    default: return `+${v} ${k}`;
  }
}

function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${m}:${String(ss).padStart(2, '0')}`;
}

// --------------------------------------------------- commander intel rows

function intelSignature(g: GameState, team: TeamId): string {
  return g.teams[team].players
    .map(p => `${p.hero.defId}:${p.hero.level}:${p.hero.items.map(i => i?.defId ?? '_').join(',')}`)
    .join('|');
}

function rebuildIntel(g: GameState, team: TeamId) {
  const row = R!.intelRows[team];
  row.innerHTML = '';
  for (const p of g.teams[team].players) {
    if (p.id === hudPlayerId) continue; // you know your own pockets
    const box = el('div', 'intel-commander');
    const port = heroPortraitCanvas(p.hero.defId, 26);
    box.appendChild(port);
    box.appendChild(el('span', 'ic-lvl', String(p.hero.level)));
    const itemsBox = el('span', 'ic-items');
    for (const it of p.hero.items) {
      if (!it) continue;
      itemsBox.appendChild(itemIconCanvas(ITEM_BY_ID[it.defId], 16));
    }
    box.appendChild(itemsBox);
    const hdef = HERO_BY_ID[p.hero.defId];
    bindTooltip(box, () => {
      const pl = playerById(hudGame!, p.id);
      const items = pl.hero.items.filter(Boolean).map(i => ITEM_BY_ID[i!.defId].name);
      return `<div class="tt-title">${pl.name === 'You' ? hdef.name : pl.name} — ${hdef.name}</div>` +
        `<div class="tt-sub">${team === (hudPlayer().team) ? 'Ally' : 'Enemy'} · level ${pl.hero.level} · Keep ${'I'.repeat(pl.baseLevel)}</div>` +
        `<div class="tt-body">${items.length ? items.join('<br/>') : 'No items yet'}</div>`;
    });
    row.appendChild(box);
  }
}

// per-frame HUD refresh
let lastItemSig = '';
export function updateHud(g: GameState) {
  if (!R) return;
  const me = hudPlayer();
  const hero = me.hero;
  const t = g.t;

  for (const team of [0, 1] as TeamId[]) {
    const ts = g.teams[team];
    const pct = Math.max(0, ts.castleHp / ts.castleMaxHp);
    R.castleFill[team].style.width = `${pct * 100}%`;
    R.castleText[team].textContent = `${Math.ceil(ts.castleHp)} / ${ts.castleMaxHp}`;
    const teamIncome = ts.players.reduce((s, p) => s + p.income, 0);
    R.castleName[team].innerHTML =
      `<span>${ts.name.toUpperCase()} · KEEP ${'I'.repeat(ts.maxKeep)}</span>` +
      `<span style="color:#9a8fc4">income ${Math.round(teamIncome)}</span>`;
    R.castleBadges[team].textContent =
      `${ts.underdog ? "🔥 Underdog's Favor " : ''}${ts.lastStand ? '🏹 Last Stand ' : ''}`;
    const sig = intelSignature(g, team);
    if (sig !== intelSig[team]) {
      intelSig[team] = sig;
      rebuildIntel(g, team);
    }
  }

  R.gold.textContent = `🪙 ${Math.floor(me.gold)}`;
  const next = Math.max(0, g.nextIncomeAt - t);
  R.income.textContent = `+${Math.round(me.income * (g.teams[me.team].underdog ? C.UNDERDOG_INCOME : 1))} in ${Math.ceil(next)}s`;
  R.clock.textContent = fmtTime(t);
  R.twilight.textContent = g.twilightLevel > 0
    ? `✦ TWILIGHT ${g.twilightLevel}`
    : t > C.TWILIGHT_AT - 120 ? `twilight in ${fmtTime(C.TWILIGHT_AT - t)}` : '';

  if (hero.d) {
    R.hpFill.style.width = `${(hero.hp / hero.d.maxHp) * 100}%`;
    R.hpText.textContent = `${Math.ceil(Math.max(0, hero.hp))} / ${Math.round(hero.d.maxHp)}`;
    R.mpFill.style.width = `${(hero.mana / hero.d.maxMana) * 100}%`;
    R.mpText.textContent = `${Math.floor(hero.mana)} / ${Math.round(hero.d.maxMana)}`;
    R.level.textContent = String(hero.level);
    R.xp.style.width = `${(hero.xp / xpNeed(hero.level)) * 100}%`;
    R.statsLine.innerHTML =
      `<span>⚔ <b>${Math.round(hero.d.dmg)}</b></span>` +
      `<span>🛡 <b>${hero.d.armor.toFixed(1)}</b></span>` +
      `<span>✦ <b>${Math.round(hero.d.sp)}</b></span>` +
      `<span>👟 <b>${Math.round(hero.d.ms)}</b></span>` +
      (hero.dead ? `<span style="color:#ff7a5c">☠ ${Math.ceil(hero.respawnAt - t)}s</span>` : '');
    R.portraitBox.style.filter = hero.dead ? 'grayscale(1) brightness(0.55)' : '';
  }

  for (let i = 0; i < 4; i++) {
    const { veil, slot, mana } = R.abSlots[i];
    const ab = ABILITY_BY_ID[hero.loadout[i]];
    const locked = i === 3 && hero.level < C.ULT_LEVEL;
    const cdLeft = hero.cds[i] - t;
    slot.classList.toggle('locked', locked);
    slot.classList.toggle('no-mana', !locked && hero.mana < ab.mana);
    if (locked) {
      veil.classList.remove('hidden');
      veil.textContent = `LVL ${C.ULT_LEVEL}`;
    } else if (cdLeft > 0) {
      veil.classList.remove('hidden');
      veil.textContent = cdLeft >= 9.5 ? String(Math.ceil(cdLeft)) : cdLeft.toFixed(1);
    } else veil.classList.add('hidden');
    mana.textContent = String(ab.mana);
  }

  const sig = hero.items.map(i => i?.defId ?? '_').join(',');
  if (sig !== lastItemSig) {
    lastItemSig = sig;
    for (let i = 0; i < 6; i++) {
      const box = R.itemSlots[i];
      box.innerHTML = '';
      box.appendChild(el('div', 'key', String(i + 1)));
      const it = hero.items[i];
      if (it) {
        const def = ITEM_BY_ID[it.defId];
        box.appendChild(itemIconCanvas(def, 44));
        const veil = el('div', 'cd-veil hidden');
        veil.dataset.slot = String(i);
        box.appendChild(veil);
        bindTooltip(box, () => {
          const def2 = ITEM_BY_ID[hudPlayer().hero.items[i]?.defId ?? it.defId];
          const stats = Object.entries(def2.stats).map(([k, v]) => statLabel(k, v as number)).join(' · ');
          const sv = sellValue(hudGame!, hudPlayer(), i);
          const sellLine = sv
            ? `<div class="tt-meta">Right-click to ${sv.undo ? `<b style="color:#7df3a0">undo</b> (refund ${sv.gold}g)` : `sell for ${sv.gold}g`}</div>`
            : '';
          return `<div class="tt-title">${def2.name}</div>` +
            `<div class="tt-sub">${def2.tier === 'forged' ? '⚒ Forged' : 'Basic'}</div>` +
            `<div class="tt-body">${stats}${def2.procText ? '<br/>' + def2.procText : ''}</div>` +
            `<div class="tt-flavor">${def2.desc}</div>${sellLine}`;
        });
      } else {
        ttMap.delete(box);
      }
    }
  }
  for (let i = 0; i < 6; i++) {
    const it = hero.items[i];
    const veil = R.itemSlots[i].querySelector('.cd-veil') as HTMLElement | null;
    if (it && veil) {
      const def = ITEM_BY_ID[it.defId];
      const left = it.readyAt - t;
      if (def.proc === 'galedash' && left > 0) {
        veil.classList.remove('hidden');
        veil.textContent = String(Math.ceil(left));
      } else if (def.proc === 'revive' && it.used) {
        veil.classList.remove('hidden');
        veil.textContent = '✕';
      } else veil.classList.add('hidden');
    }
  }

  if (panelTab && t >= panelRefreshAt) {
    panelRefreshAt = t + 0.25;
    const body = $('side-panel');
    if (panelTab === 'barracks' && R.queueBar) {
      const gate = C.SPAWN_INTERVAL[me.baseLevel] * Math.max(C.TWILIGHT_GATE_MIN, Math.pow(C.TWILIGHT_GATE, g.twilightLevel));
      R.queueBar.textContent = me.sendQueue.length > 0
        ? `${me.sendQueue.length} monsters queued at your gate (one marches every ${gate.toFixed(2)}s)`
        : `Your gate stands ready (one marches every ${gate.toFixed(2)}s)`;
      body.querySelectorAll<HTMLElement>('.unit-card').forEach(card => {
        const u = UNIT_BY_ID[card.dataset.unit!];
        if (u && !card.classList.contains('locked')) card.classList.toggle('unaffordable', me.gold < u.cost);
      });
    }
    if (panelTab === 'forge' && R.queueBar) {
      R.queueBar.textContent = `🪙 ${Math.floor(me.gold)} gold`;
      body.querySelectorAll<HTMLElement>('.shop-item').forEach(card => {
        const it = ITEM_BY_ID[card.dataset.item!];
        if (it) card.classList.toggle('unaffordable', me.gold < it.cost);
      });
    }
    if (panelTab === 'council') {
      const rep = body.querySelector<HTMLElement>('[data-role="repair"]');
      if (rep) rep.textContent = `${repairCost(me)}g`;
      for (const key of ['str', 'agi', 'int', 'dmg', 'armor'] as const) {
        const b = body.querySelector<HTMLElement>(`[data-role="stat-${key}"]`);
        if (b) b.textContent = me.statUp[key] >= C.STAT_CAP ? 'MAX' : `${statCost(me, key)}g`;
        const cnt = body.querySelector<HTMLElement>(`[data-count="${key}"]`);
        if (cnt) cnt.textContent = `(${me.statUp[key]}/${C.STAT_CAP})`;
      }
    }
  }
}

export function setPauseVeil(paused: boolean) {
  $('pause-veil').classList.toggle('hidden', !paused);
}

// ------------------------------------------------------------------- end

export function showEnd(g: GameState, playerTeam: TeamId, isSpectate: boolean, onAgain: () => void, onMenu: () => void) {
  const root = $('screen-end');
  root.innerHTML = '';
  const won = g.winner === playerTeam;
  const box = el('div', 'end-box');
  const title = isSpectate
    ? el('div', `end-title victory`, `${g.teams[g.winner as TeamId].name.toUpperCase()} PREVAILS`)
    : el('div', `end-title ${won ? 'victory' : 'defeat'}`, won ? 'VICTORY' : 'DEFEAT');
  box.appendChild(title);
  box.appendChild(el('div', 'end-sub', isSpectate
    ? `The war lasted ${fmtTime(g.t)}.`
    : won
      ? `Duskreach lies in ruin. The Vale remembers its protectors. (${fmtTime(g.t)})`
      : `Dawnhold has fallen. The Vale remembers that too. (${fmtTime(g.t)})`));

  const sum = (team: TeamId, key: keyof PlayerState['stats']) =>
    g.teams[team].players.reduce((s, p) => s + (p.stats[key] as number), 0);
  const heroes = (team: TeamId) => g.teams[team].players.map(p => `${HERO_BY_ID[p.hero.defId].name} (${p.hero.level})`).join('<br/>');

  const mine = playerTeam;
  const foes = (1 - playerTeam) as TeamId;
  const table = el('table', 'end-stats');
  table.innerHTML = `<tr><th></th><th>${isSpectate ? g.teams[mine].name : 'YOUR WARBAND'}</th><th>${isSpectate ? g.teams[foes].name : 'THE ENEMY'}</th></tr>` +
    [
      ['Champions', heroes(mine), heroes(foes)],
      ['Monsters slain', sum(mine, 'kills'), sum(foes, 'kills')],
      ['Monsters sent', sum(mine, 'sent'), sum(foes, 'sent')],
      ['Final income', g.teams[mine].players.reduce((s, p) => s + Math.round(p.income), 0), g.teams[foes].players.reduce((s, p) => s + Math.round(p.income), 0)],
      ['Gold earned', Math.floor(sum(mine, 'goldEarned')), Math.floor(sum(foes, 'goldEarned'))],
      ['Castle damage dealt', Math.round(sum(mine, 'dmgToCastle')), Math.round(sum(foes, 'dmgToCastle'))],
      ['Leaks suffered', sum(mine, 'leaks'), sum(foes, 'leaks')],
    ].map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td></tr>`).join('');
  box.appendChild(table);

  const actions = el('div', 'end-actions');
  const again = el('button', 'btn btn-primary btn-big', '⚔ Fight Again');
  again.onclick = () => { sfx.click(); onAgain(); };
  const menu = el('button', 'btn btn-big', 'Return to Menu');
  menu.onclick = () => { sfx.click(); onMenu(); };
  actions.append(again, menu);
  box.appendChild(actions);
  root.appendChild(box);
  screen('end');
}
