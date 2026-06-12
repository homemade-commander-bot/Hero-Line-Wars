// ---------------------------------------------------------------------------
// Headless balance harness: AI vs AI, no rendering.
//   npm run sim            -> 20 matches, knight AI
//   npm run sim -- 50      -> 50 matches
//   npm run sim -- 30 warlord
// Used to tune match length (target: 15-45 min) and hero winrates.
// ---------------------------------------------------------------------------

import { newGame, randomLoadout, step } from './engine';
import { aiThink } from './ai';
import { HEROES } from './data/heroes';
import { mulberry32, C } from './data/constants';
import type { Difficulty } from './data/constants';

const matches = parseInt(process.argv[2] ?? '20', 10);
const difficulty = (process.argv[3] ?? 'knight') as Difficulty;
const difficulty2 = (process.argv[4] ?? difficulty) as Difficulty;
const MAX_MIN = 75;

interface Result {
  heroes: [string, string];
  winner: number;
  minutes: number;
  incomes: [number, number];
  kills: [number, number];
  sent: [number, number];
  levels: [number, number];
}

const results: Result[] = [];
const heroWins: Record<string, { w: number; n: number }> = {};
for (const h of HEROES) heroWins[h.id] = { w: 0, n: 0 };

console.log(`Hero Line Wars — simulating ${matches} ${difficulty} vs ${difficulty2} matches...\n`);

for (let m = 0; m < matches; m++) {
  const seedRng = mulberry32(1000 + m * 77);
  const a = HEROES[Math.floor(seedRng() * HEROES.length)].id;
  let b = HEROES[Math.floor(seedRng() * HEROES.length)].id;
  if (b === a) b = HEROES[(HEROES.findIndex(h => h.id === a) + 1 + Math.floor(seedRng() * (HEROES.length - 1))) % HEROES.length].id;

  const g = newGame({
    heroIds: [a, b],
    loadouts: [randomLoadout(a, seedRng), randomLoadout(b, seedRng)],
    ai: [true, true],
    difficulty: [difficulty, difficulty2],
    seed: 1000 + m * 77,
  });

  const dt = C.DT;
  const maxSteps = Math.round((MAX_MIN * 60) / dt);
  let steps = 0;
  while (!g.over && steps < maxSteps) {
    aiThink(g, 0);
    aiThink(g, 1);
    step(g, dt);
    g.events.length = 0;
    steps++;
  }

  const minutes = g.t / 60;
  const r: Result = {
    heroes: [a, b],
    winner: g.winner,
    minutes,
    incomes: [Math.round(g.teams[0].income), Math.round(g.teams[1].income)],
    kills: [g.teams[0].stats.kills, g.teams[1].stats.kills],
    sent: [g.teams[0].stats.sent, g.teams[1].stats.sent],
    levels: [g.teams[0].hero.level, g.teams[1].hero.level],
  };
  results.push(r);
  heroWins[a].n++; heroWins[b].n++;
  if (g.winner === 0) heroWins[a].w++;
  if (g.winner === 1) heroWins[b].w++;

  const wName = g.winner === -1 ? 'TIMEOUT' : g.winner === 0 ? a : b;
  console.log(
    `#${String(m + 1).padStart(2)} ${a.padEnd(9)} vs ${b.padEnd(9)} -> ${wName.padEnd(9)} in ${minutes.toFixed(1).padStart(5)}m | ` +
    `inc ${r.incomes[0]}/${r.incomes[1]} | lvl ${r.levels[0]}/${r.levels[1]} | kills ${r.kills[0]}/${r.kills[1]} | sent ${r.sent[0]}/${r.sent[1]}`,
  );
}

const durations = results.filter(r => r.winner !== -1).map(r => r.minutes).sort((x, y) => x - y);
const med = durations.length ? durations[Math.floor(durations.length / 2)] : 0;
const timeouts = results.filter(r => r.winner === -1).length;

console.log('\n================ summary ================');
console.log(`matches: ${matches}   timeouts: ${timeouts}`);
const t0wins = results.filter(r => r.winner === 0).length;
console.log(`team0 (${difficulty}) wins ${t0wins} — team1 (${difficulty2}) wins ${results.filter(r => r.winner === 1).length}`);
if (durations.length) {
  console.log(`duration  min ${durations[0].toFixed(1)}m   median ${med.toFixed(1)}m   max ${durations[durations.length - 1].toFixed(1)}m`);
  const in15to45 = durations.filter(d => d >= 15 && d <= 45).length;
  console.log(`in 15-45m window: ${in15to45}/${durations.length} (${Math.round((100 * in15to45) / durations.length)}%)`);
}
console.log('\nhero winrates:');
for (const h of HEROES) {
  const s = heroWins[h.id];
  const rate = s.n ? Math.round((100 * s.w) / s.n) : 0;
  console.log(`  ${h.id.padEnd(9)} ${String(s.w).padStart(2)}/${String(s.n).padEnd(2)} (${rate}%)`);
}
