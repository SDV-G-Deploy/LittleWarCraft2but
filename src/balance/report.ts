import type { EntityKind, Race } from '../types';
import { resolveEntityStats } from './resolver';

export interface MatchupSnapshot {
  attackerRace: Race;
  attackerKind: EntityKind;
  defenderRace: Race;
  defenderKind: EntityKind;
  attackerHp: number;
  defenderHp: number;
  attackerDamagePerHit: number;
  defenderDamagePerHit: number;
  attackerAttackSeconds: number;
  defenderAttackSeconds: number;
  attackerDps: number;
  defenderDps: number;
  attackerHitsToKill: number;
  defenderHitsToKill: number;
  attackerTimeToKillSeconds: number;
  defenderTimeToKillSeconds: number;
  hpPerGoldAttacker: number | null;
  hpPerGoldDefender: number | null;
  damagePerGoldAttacker: number | null;
  damagePerGoldDefender: number | null;
}

export function effectiveDamagePerHit(attackerKind: EntityKind, attackerRace: Race, defenderKind: EntityKind, defenderRace: Race): number {
  const attacker = resolveEntityStats(attackerKind, attackerRace);
  const defender = resolveEntityStats(defenderKind, defenderRace);
  return Math.max(1, attacker.damage - defender.armor);
}

export function hitsToKill(attackerKind: EntityKind, attackerRace: Race, defenderKind: EntityKind, defenderRace: Race): number {
  const defender = resolveEntityStats(defenderKind, defenderRace);
  const damage = effectiveDamagePerHit(attackerKind, attackerRace, defenderKind, defenderRace);
  return Math.ceil(defender.hp / damage);
}

export function attackSeconds(kind: EntityKind, race: Race): number {
  const stats = resolveEntityStats(kind, race);
  return stats.attackTicks > 0 ? stats.attackTicks / 20 : 0;
}

export function dps(kind: EntityKind, race: Race, targetKind: EntityKind, targetRace: Race): number {
  const seconds = attackSeconds(kind, race);
  if (seconds <= 0) return 0;
  return effectiveDamagePerHit(kind, race, targetKind, targetRace) / seconds;
}

export function hpPerGold(kind: EntityKind, race: Race): number | null {
  const stats = resolveEntityStats(kind, race);
  if (stats.cost.gold <= 0) return null;
  return stats.hp / stats.cost.gold;
}

export function damagePerGold(kind: EntityKind, race: Race): number | null {
  const stats = resolveEntityStats(kind, race);
  if (stats.cost.gold <= 0) return null;
  return stats.damage / stats.cost.gold;
}

export function timeToKillSeconds(attackerKind: EntityKind, attackerRace: Race, defenderKind: EntityKind, defenderRace: Race): number {
  return hitsToKill(attackerKind, attackerRace, defenderKind, defenderRace) * attackSeconds(attackerKind, attackerRace);
}

export function buildMatchupSnapshot(attackerKind: EntityKind, attackerRace: Race, defenderKind: EntityKind, defenderRace: Race): MatchupSnapshot {
  const attacker = resolveEntityStats(attackerKind, attackerRace);
  const defender = resolveEntityStats(defenderKind, defenderRace);

  return {
    attackerRace,
    attackerKind,
    defenderRace,
    defenderKind,
    attackerHp: attacker.hp,
    defenderHp: defender.hp,
    attackerDamagePerHit: effectiveDamagePerHit(attackerKind, attackerRace, defenderKind, defenderRace),
    defenderDamagePerHit: effectiveDamagePerHit(defenderKind, defenderRace, attackerKind, attackerRace),
    attackerAttackSeconds: attackSeconds(attackerKind, attackerRace),
    defenderAttackSeconds: attackSeconds(defenderKind, defenderRace),
    attackerDps: dps(attackerKind, attackerRace, defenderKind, defenderRace),
    defenderDps: dps(defenderKind, defenderRace, attackerKind, attackerRace),
    attackerHitsToKill: hitsToKill(attackerKind, attackerRace, defenderKind, defenderRace),
    defenderHitsToKill: hitsToKill(defenderKind, defenderRace, attackerKind, attackerRace),
    attackerTimeToKillSeconds: timeToKillSeconds(attackerKind, attackerRace, defenderKind, defenderRace),
    defenderTimeToKillSeconds: timeToKillSeconds(defenderKind, defenderRace, attackerKind, attackerRace),
    hpPerGoldAttacker: hpPerGold(attackerKind, attackerRace),
    hpPerGoldDefender: hpPerGold(defenderKind, defenderRace),
    damagePerGoldAttacker: damagePerGold(attackerKind, attackerRace),
    damagePerGoldDefender: damagePerGold(defenderKind, defenderRace),
  };
}
