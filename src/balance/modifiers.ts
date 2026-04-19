import type { Entity, GameState } from '../types';
import { SIM_HZ, isUnitKind } from '../types';

export interface AttackModifierContext {
  state: GameState;
  attacker: Entity;
  target: Entity;
}

export interface AttackModifierRule {
  id: string;
  description: string;
  apply(ctx: AttackModifierContext): number;
}

function isWorkerTarget(target: Entity): boolean {
  return target.kind === 'worker' || target.kind === 'peon';
}

function isNearContestedMine(state: GameState, attacker: Entity, target: Entity): boolean {
  if (target.kind === 'goldmine') return false;

  const myTownHall = state.entities.find(e => e.owner === attacker.owner && e.kind === 'townhall');
  const enemyTownHall = state.entities.find(e => e.owner !== attacker.owner && e.kind === 'townhall');

  return state.entities.some(e => {
    if (e.kind !== 'goldmine' || (e.goldReserve ?? 0) <= 0) return false;
    const myDist = myTownHall ? Math.hypot(e.pos.x - myTownHall.pos.x, e.pos.y - myTownHall.pos.y) : Infinity;
    const enemyDist = enemyTownHall ? Math.hypot(e.pos.x - enemyTownHall.pos.x, e.pos.y - enemyTownHall.pos.y) : Infinity;
    const isContested = (e.pos.x > 16 && e.pos.x < 48) || Math.abs(myDist - enemyDist) <= 8;
    if (!isContested) return false;
    const targetCx = target.pos.x + target.tileW / 2;
    const targetCy = target.pos.y + target.tileH / 2;
    const mineCx = e.pos.x + e.tileW / 2;
    const mineCy = e.pos.y + e.tileH / 2;
    return Math.hypot(targetCx - mineCx, targetCy - mineCy) <= 7;
  });
}

export const ATTACK_MODIFIER_RULES: AttackModifierRule[] = [
  {
    id: 'worker_pressure_bonus',
    description: 'Mobile units deal +1 against workers.',
    apply: ({ attacker, target }) => (!isUnitKind(attacker.kind) ? 0 : isWorkerTarget(target) ? 1 : 0),
  },
  {
    id: 'construction_pressure_bonus',
    description: 'All attackers deal +1 against construction scaffolds.',
    apply: ({ target }) => (target.kind === 'construction' ? 1 : 0),
  },
  {
    id: 'contested_mine_pressure_bonus',
    description: 'Mobile units deal +1 near contested mines during the opening clash window.',
    apply: ({ state, attacker, target }) => (
      isUnitKind(attacker.kind) &&
      state.tick <= state.contestedMineBonusUntilTick &&
      isNearContestedMine(state, attacker, target)
        ? 1
        : 0
    ),
  },
  {
    id: 'opening_pressure_bonus',
    description: 'Pressure-tagged opening units deal +1 damage early.',
    apply: ({ state, attacker }) => (
      attacker.openingPlan === 'pressure' &&
      isUnitKind(attacker.kind) &&
      state.tick <= SIM_HZ * 18
        ? 1
        : 0
    ),
  },
];

export function resolveAttackBonus(ctx: AttackModifierContext): number {
  let bonus = 0;
  for (const rule of ATTACK_MODIFIER_RULES) {
    bonus += rule.apply(ctx);
  }
  return bonus;
}
