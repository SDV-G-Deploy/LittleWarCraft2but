import type { GameState, LumberUpgradeKind, PlayerOwner, Race } from '../types';
import { PLAYER_1, PLAYER_2, SIM_HZ, isUnitKind } from '../types';
import { DOCTRINE_COST } from '../balance/doctrines';
import { RACE_BALANCE_PROFILES } from '../balance/races';
import { hasUpgradeGroup, resolveEntityStats } from '../balance/resolver';

export const LUMBER_UPGRADE_DURATION_TICKS = SIM_HZ * 15;

function getBuildingHpMultiplier(race: Race, level: number): number {
  return race === 'human' ? 1 + (level * 20) / 100 : 1 + (level * 10) / 100;
}

function applyCompletedLumberUpgrade(state: GameState, owner: PlayerOwner, kind: LumberUpgradeKind): void {
  const upgrades = state.upgrades[owner];
  const race = state.races[owner];

  if (kind === 'doctrineFieldTempo' || kind === 'doctrineLineHold' || kind === 'doctrineLongReach') {
    upgrades.doctrine = kind === 'doctrineFieldTempo'
      ? 'fieldTempo'
      : kind === 'doctrineLineHold'
        ? 'lineHold'
        : 'longReach';
    return;
  }

  const defs = RACE_BALANCE_PROFILES[race].upgrades;
  const levelKey = kind === 'meleeAttack' ? 'meleeAttackLevel' : kind === 'armor' ? 'armorLevel' : 'buildingHpLevel';
  const currentLevel = upgrades[levelKey];
  upgrades[levelKey] = currentLevel + 1;

  if (kind === 'buildingHp') {
    const prevMult = getBuildingHpMultiplier(race, currentLevel);
    const nextMult = getBuildingHpMultiplier(race, currentLevel + 1);
    for (const e of state.entities) {
      if (e.owner !== owner || e.kind === 'goldmine' || isUnitKind(e.kind)) continue;
      const baseMax = Math.round(e.hpMax / prevMult);
      const nextMax = Math.round(baseMax * nextMult);
      const hpRatio = e.hpMax > 0 ? e.hp / e.hpMax : 1;
      e.hpMax = nextMax;
      e.hp = Math.round(nextMax * hpRatio);
      e.statHpMax = nextMax;
    }
  }

  if (kind === 'armor') {
    const perLevel = race === 'human' ? 2 : 1;
    for (const e of state.entities) {
      if (e.owner !== owner || !isUnitKind(e.kind)) continue;
      if (!hasUpgradeGroup(e.kind, race, 'military')) continue;
      const baseArmor = resolveEntityStats(e.kind, race).armor;
      e.statArmor = baseArmor + upgrades.armorLevel * perLevel;
    }
  }

  void defs;
}

export function tryStartLumberUpgrade(state: GameState, owner: PlayerOwner, kind: LumberUpgradeKind): boolean {
  const upgrades = state.upgrades[owner];
  if (upgrades.pendingLumberUpgrade) return false;

  if (kind === 'doctrineFieldTempo' || kind === 'doctrineLineHold' || kind === 'doctrineLongReach') {
    if (upgrades.doctrine) return false;
    if (state.gold[owner] < DOCTRINE_COST.gold || state.wood[owner] < DOCTRINE_COST.wood) return false;
    state.gold[owner] -= DOCTRINE_COST.gold;
    state.wood[owner] -= DOCTRINE_COST.wood;
    upgrades.pendingLumberUpgrade = { kind, completeTick: state.tick + LUMBER_UPGRADE_DURATION_TICKS };
    return true;
  }

  const race = state.races[owner];
  const defs = RACE_BALANCE_PROFILES[race].upgrades;
  const config = kind === 'meleeAttack' ? defs.meleeAttack : kind === 'armor' ? defs.armor : defs.buildingHp;
  const levelKey = kind === 'meleeAttack' ? 'meleeAttackLevel' : kind === 'armor' ? 'armorLevel' : 'buildingHpLevel';
  const currentLevel = upgrades[levelKey];
  if (currentLevel >= config.maxLevel) return false;
  const cost = config.cost;
  if (state.gold[owner] < cost.gold || state.wood[owner] < cost.wood) return false;

  state.gold[owner] -= cost.gold;
  state.wood[owner] -= cost.wood;
  upgrades.pendingLumberUpgrade = { kind, completeTick: state.tick + LUMBER_UPGRADE_DURATION_TICKS };
  return true;
}

export function tickLumberUpgrades(state: GameState): void {
  for (const owner of [PLAYER_1, PLAYER_2] as const) {
    const pending = state.upgrades[owner].pendingLumberUpgrade;
    if (!pending) continue;
    if (state.tick < pending.completeTick) continue;
    state.upgrades[owner].pendingLumberUpgrade = null;
    applyCompletedLumberUpgrade(state, owner, pending.kind);
  }
}
