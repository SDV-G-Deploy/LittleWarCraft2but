import type { EntityKind, Race } from '../types';
import { resolveEntityStats } from './resolver';
import { RACE_BALANCE_PROFILES } from './races';

interface EntityRow {
  race: Race;
  kind: EntityKind;
  class: string;
  hp: number;
  damage: number;
  armor: number;
  attackRange: number;
  sight: number;
  moveSpeed: number;
  attackSeconds: number;
  buildSeconds: number;
  gold: number;
  wood: number;
  supplyProvided: number;
  tile: string;
  tags: string;
  targetPolicy: string;
  losPolicy: string;
}

interface UpgradeRow {
  race: Race;
  id: string;
  perLevel: number;
  maxLevel: number;
  gold: number;
  wood: number;
  totalGold: number;
  totalWood: number;
  appliesTo: string;
}

const ENTITY_ROWS: Array<{ race: Race; kind: EntityKind }> = [
  { race: 'human', kind: 'worker' },
  { race: 'human', kind: 'footman' },
  { race: 'human', kind: 'archer' },
  { race: 'human', kind: 'knight' },
  { race: 'human', kind: 'townhall' },
  { race: 'human', kind: 'barracks' },
  { race: 'human', kind: 'lumbermill' },
  { race: 'human', kind: 'farm' },
  { race: 'human', kind: 'wall' },
  { race: 'human', kind: 'tower' },
  { race: 'orc', kind: 'peon' },
  { race: 'orc', kind: 'grunt' },
  { race: 'orc', kind: 'troll' },
  { race: 'orc', kind: 'ogreFighter' },
  { race: 'orc', kind: 'townhall' },
  { race: 'orc', kind: 'barracks' },
  { race: 'orc', kind: 'lumbermill' },
  { race: 'orc', kind: 'farm' },
  { race: 'orc', kind: 'wall' },
  { race: 'orc', kind: 'tower' },
];

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function getTargetPolicy(kind: EntityKind, race: Race): string {
  const s = resolveEntityStats(kind, race);
  const p = s.targetPolicy;
  if (!p) return 'n/a';
  const parts: string[] = [];
  if (p.canAttackUnits) parts.push('units');
  if (p.canAttackBuildings) parts.push('buildings');
  if (p.canAttackWalls) parts.push('walls');
  return parts.length > 0 ? parts.join('/') : 'none';
}

function getLosPolicy(kind: EntityKind, race: Race): string {
  const s = resolveEntityStats(kind, race);
  const p = s.losPolicy;
  if (!p) return 'n/a';
  if (!p.requiresLOS) return p.elevated ? 'no LOS required, elevated' : 'no LOS required';
  return p.elevated ? 'LOS required, elevated' : 'LOS required';
}

function getUpgradeAppliesTo(race: Race, id: 'meleeAttack' | 'armor' | 'buildingHp'): string {
  const appliesTo = RACE_BALANCE_PROFILES[race].upgrades[id].appliesTo;
  if (appliesTo.includes('building')) return 'all player buildings';
  if (appliesTo.includes('melee')) return race === 'human' ? 'footman, knight' : 'grunt, ogreFighter';
  if (appliesTo.includes('military')) return race === 'human' ? 'footman, archer, knight' : 'grunt, troll, ogreFighter';
  return appliesTo.join(', ');
}

function buildEntityRows(): EntityRow[] {
  return ENTITY_ROWS.map(({ race, kind }) => {
    const s = resolveEntityStats(kind, race);
    return {
      race,
      kind,
      class: s.class,
      hp: s.hp,
      damage: s.damage,
      armor: s.armor,
      attackRange: s.range,
      sight: s.sight,
      moveSpeed: s.speed,
      attackSeconds: s.attackTicks > 0 ? s.attackTicks / 20 : 0,
      buildSeconds: s.buildTicks > 0 ? s.buildTicks / 20 : 0,
      gold: s.cost.gold,
      wood: s.cost.wood,
      supplyProvided: s.supplyProvided ?? 0,
      tile: `${s.tileW}x${s.tileH}`,
      tags: s.tags.join(', '),
      targetPolicy: getTargetPolicy(kind, race),
      losPolicy: getLosPolicy(kind, race),
    };
  });
}

function buildUpgradeRows(): UpgradeRow[] {
  return (['human', 'orc'] as Race[]).flatMap((race) => {
    const upgrades = RACE_BALANCE_PROFILES[race].upgrades;
    return (Object.entries(upgrades) as Array<[keyof typeof upgrades, (typeof upgrades)[keyof typeof upgrades]]>).map(([id, up]) => ({
      race,
      id,
      perLevel: up.perLevel,
      maxLevel: up.maxLevel,
      gold: up.cost.gold,
      wood: up.cost.wood,
      totalGold: up.cost.gold * up.maxLevel,
      totalWood: up.cost.wood * up.maxLevel,
      appliesTo: getUpgradeAppliesTo(race, id),
    }));
  });
}

function entityRowsToMarkdown(rows: EntityRow[]): string {
  const header = '| Race | Kind | Class | HP | DMG | ARM | ATK RNG | Sight | Move | Atk s | Build s | Gold | Wood | Supply | Tile | Targets | LOS | Tags |';
  const sep = '|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|---|';
  const body = rows.map((r) => `| ${r.race} | ${r.kind} | ${r.class} | ${fmt(r.hp)} | ${fmt(r.damage)} | ${fmt(r.armor)} | ${fmt(r.attackRange)} | ${fmt(r.sight)} | ${fmt(r.moveSpeed)} | ${fmt(r.attackSeconds)} | ${fmt(r.buildSeconds)} | ${fmt(r.gold)} | ${fmt(r.wood)} | ${fmt(r.supplyProvided)} | ${r.tile} | ${r.targetPolicy} | ${r.losPolicy} | ${r.tags} |`).join('\n');
  return [header, sep, body].join('\n');
}

function upgradeRowsToMarkdown(rows: UpgradeRow[]): string {
  const header = '| Race | Upgrade | Per level | Max | Gold | Wood | Total gold | Total wood | Applies to |';
  const sep = '|---|---|---:|---:|---:|---:|---:|---:|---|';
  const body = rows.map((r) => `| ${r.race} | ${r.id} | ${fmt(r.perLevel)} | ${fmt(r.maxLevel)} | ${fmt(r.gold)} | ${fmt(r.wood)} | ${fmt(r.totalGold)} | ${fmt(r.totalWood)} | ${r.appliesTo} |`).join('\n');
  return [header, sep, body].join('\n');
}

const entityRows = buildEntityRows();
const upgradeRows = buildUpgradeRows();

console.log('# LW2B Balance Sheet');
console.log('');
console.log('## Entity stats');
console.log(entityRowsToMarkdown(entityRows));
console.log('');
console.log('## Upgrades');
console.log(upgradeRowsToMarkdown(upgradeRows));
