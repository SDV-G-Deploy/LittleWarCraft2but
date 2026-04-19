import type { EntityKind, Race } from '../types';
import { buildMatchupSnapshot } from './report';

interface MatchupSpec {
  attackerKind: EntityKind;
  attackerRace: Race;
  defenderKind: EntityKind;
  defenderRace: Race;
  label: string;
}

const MATCHUPS: MatchupSpec[] = [
  { label: 'Footman vs Grunt', attackerKind: 'footman', attackerRace: 'human', defenderKind: 'grunt', defenderRace: 'orc' },
  { label: 'Archer vs Troll', attackerKind: 'archer', attackerRace: 'human', defenderKind: 'troll', defenderRace: 'orc' },
  { label: 'Knight vs Ogre Fighter', attackerKind: 'knight', attackerRace: 'human', defenderKind: 'ogreFighter', defenderRace: 'orc' },
  { label: 'Human Wall vs Orc Grunt', attackerKind: 'wall', attackerRace: 'human', defenderKind: 'grunt', defenderRace: 'orc' },
  { label: 'Orc Wall vs Human Footman', attackerKind: 'wall', attackerRace: 'orc', defenderKind: 'footman', defenderRace: 'human' },
];

function fmt(n: number | null, digits = 2): string {
  if (n === null) return '-';
  return n.toFixed(digits);
}

for (const spec of MATCHUPS) {
  const row = buildMatchupSnapshot(spec.attackerKind, spec.attackerRace, spec.defenderKind, spec.defenderRace);
  console.log(`\n## ${spec.label}`);
  console.log(`attacker: ${row.attackerRace}/${row.attackerKind} | defender: ${row.defenderRace}/${row.defenderKind}`);
  console.log(`hp: ${row.attackerHp} vs ${row.defenderHp}`);
  console.log(`damage/hit: ${fmt(row.attackerDamagePerHit, 0)} vs ${fmt(row.defenderDamagePerHit, 0)}`);
  console.log(`attack seconds: ${fmt(row.attackerAttackSeconds)} vs ${fmt(row.defenderAttackSeconds)}`);
  console.log(`dps: ${fmt(row.attackerDps)} vs ${fmt(row.defenderDps)}`);
  console.log(`hits to kill: ${row.attackerHitsToKill} vs ${row.defenderHitsToKill}`);
  console.log(`time to kill: ${fmt(row.attackerTimeToKillSeconds)}s vs ${fmt(row.defenderTimeToKillSeconds)}s`);
  console.log(`hp/gold: ${fmt(row.hpPerGoldAttacker)} vs ${fmt(row.hpPerGoldDefender)}`);
  console.log(`damage/gold: ${fmt(row.damagePerGoldAttacker)} vs ${fmt(row.damagePerGoldDefender)}`);
}
