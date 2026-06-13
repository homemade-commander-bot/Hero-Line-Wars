// ---------------------------------------------------------------------------
// Headless balance harness: AI vs AI, no rendering.
//   npm run sim                  -> 20 matches, knight, 1v1
//   npm run sim -- 50            -> 50 matches
//   npm run sim -- 30 warlord    -> difficulty
//   npm run sim -- 20 knight knight 3  -> 3v3
// ---------------------------------------------------------------------------

import { newGame, randomHeroes, randomLoadout, step, allPlayers } from './engine';
import { aiThink } from './ai';
import { HEROES } from './data/heroes';
import { mulberry32, C } from './data/constants';
import type { Difficulty } from './data/constants';

const matches = parseInt(process.argv[2] ?? '20', 10);
const difficulty = (process.argv[3] ?? 'knight') as Difficulty;
const difficulty2 = (process.argv[4] ?? difficulty) as Difficulty;
const teamSize = (parseInt(process.argv[5] ?? '1', 10) === 3 ? 3 : 1) as 1 | 3;
const MAX_MIN = 75;

interface Result {
  winner: number;
  minutes: number;
  incomes: [number, number]; // team totals
  kills: [number, number];
  sent: [number, number];
}

const results: Result[] = [];
const heroWins: Record<string, { w: number; n: number }> = {};
for (const h of HEROES) heroWins[h.id] = { w: 0, n: 0 };

console.log(`Hero Line Wars — ${matches} matches, ${difficulty} vs ${difficulty2}, ${teamSize}v${teamSize}...\n`);

for (let m = 0; m < matches; m++) {
  const seedRng = mulberry32(1000 + m * 77);
  const ids = randomHeroes(seedRng, teamSize * 2);

  const g = newGame({
    teamSize,
    heroIds: ids,
    loadouts: ids.map(id => randomLoadout(id, seedRng)),
    humanPlayer: -1,
    difficulty: [difficulty, difficulty2],
    seed: 1000 + m * 77,
  });

  const dt = C.DT;
  const maxSteps = Math.round((MAX_MIN * 60) / dt);
  let steps = 0;
  const players = allPlayers(g);
  while (!g.over && steps < maxSteps) {
    for (const pl of players) if (pl.ai) aiThink(g, pl);
    step(g, dt);
    g.events.length = 0;
    steps++;
  }

  const minutes = g.t / 60;
  const teamStat = (tid: 0 | 1, key: 'kills' | 'sent') =>
    g.teams[tid].players.reduce((s, p) => s + p.stats[key], 0);
  const teamIncome = (tid: 0 | 1) => g.teams[tid].players.reduce((s, p) => s + p.income, 0);
  const r: Result = {
    winner: g.winner,
    minutes,
    incomes: [Math.round(teamIncome(0)), Math.round(teamIncome(1))],
    kills: [teamStat(0, 'kills'), teamStat(1, 'kills')],
    sent: [teamStat(0, 'sent'), teamStat(1, 'sent')],
  };
  results.push(r);
  for (const pl of players) {
    heroWins[pl.hero.defId].n++;
    if (g.winner === pl.team) heroWins[pl.hero.defId].w++;
  }

  const names = (tid: 0 | 1) => g.teams[tid].players.map(p => p.hero.defId).join('+');
  const wName = g.winner === -1 ? 'TIMEOUT' : names(g.winner as 0 | 1);
  console.log(
    `#${String(m + 1).padStart(2)} ${names(0)} vs ${names(1)} -> ${wName} in ${minutes.toFixed(1).padStart(5)}m | ` +
    `inc ${r.incomes[0]}/${r.incomes[1]} | kills ${r.kills[0]}/${r.kills[1]} | sent ${r.sent[0]}/${r.sent[1]}`,
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
  console.log(`  ${h.id.padEnd(10)} ${String(s.w).padStart(2)}/${String(s.n).padEnd(2)} (${rate}%)`);
}
