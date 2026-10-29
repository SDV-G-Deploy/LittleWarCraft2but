/** Prints the Kingdom OS balance curve: `npm run kingdom:balance`. */
import { simulate } from './kingdom-sim';
import { formatNumber, prestige } from './kingdom-economy';

const fmtT = (t: number | null) => (t === null ? 'never' : `${Math.floor(t / 60)}m${String(Math.round(t % 60)).padStart(2, '0')}s`);

console.log('Profile                      | 1st affordable | policy  | era install');
for (const [cps, policy] of [[1, 'agrarian'], [3, 'agrarian'], [3, 'merchant'], [3, 'idle'], [6, 'merchant']] as const) {
  const r = simulate({ seconds: 1200, clicksPerSecond: cps, policy, catchMail: true });
  console.log(`${`${cps} click/s, ${policy}`.padEnd(28)} | ${fmtT(r.firstAffordableAt).padEnd(14)} | ${fmtT(r.policyAt).padEnd(7)} | ${fmtT(r.prestigeReadyAt)}`);
}

const r = simulate({ seconds: 900, clicksPerSecond: 3, policy: 'agrarian', catchMail: true });
console.log('\nCurve (3 click/s, Agrarian): minute | gold/sec | earned this era | buildings');
for (const s of r.samples.filter((x) => Math.round(x.t) % 60 === 0)) {
  console.log(`${String(Math.round(s.t / 60)).padStart(6)} | ${formatNumber(s.gps).padStart(8)} | ${formatNumber(s.earned).padStart(15)} | ${s.buildings}`);
}
console.log('\nFirst 3 minutes of purchases:');
console.log(r.events.filter((e) => e.t <= 180).map((e) => `${Math.round(e.t)}s ${e.what}`).join(', '));
const second = simulate({ seconds: 900, clicksPerSecond: 3, policy: 'agrarian', catchMail: true, start: prestige(r.state) });
console.log(`\nEra 2 (with ${prestige(r.state).patches} patches): install ready at ${fmtT(second.prestigeReadyAt)}`);
