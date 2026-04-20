import type { Entity, EntityKind, Owner, GameState, Vec2 } from '../types';
import { MAP_H, MAP_W, isUnitKind } from '../types';
import { resolveEntityStatsForOwner, applyResolvedStatsToEntity } from '../balance/resolver';

export type EntityLookup = Map<number, Entity>;

function tileKey(tx: number, ty: number): number {
  return ty * MAP_W + tx;
}

function updateBlockedFootprint(state: GameState, entity: Entity, blocked: boolean): void {
  if (isUnitKind(entity.kind)) return;
  const grid = state.blockedTiles;
  if (!grid) return;
  const value = blocked ? 1 : 0;
  for (let dy = 0; dy < entity.tileH; dy++) {
    const ty = entity.pos.y + dy;
    if (ty < 0 || ty >= MAP_H) continue;
    for (let dx = 0; dx < entity.tileW; dx++) {
      const tx = entity.pos.x + dx;
      if (tx < 0 || tx >= MAP_W) continue;
      grid[tileKey(tx, ty)] = value;
    }
  }
}

function rebuildEntityIndex(state: GameState): EntityLookup {
  const index: EntityLookup = new Map();
  for (const entity of state.entities) index.set(entity.id, entity);
  state.entityById = index;
  return index;
}

export function getEntityIndex(state: GameState): EntityLookup {
  return state.entityById ?? rebuildEntityIndex(state);
}

export function spawnEntity(
  state: GameState,
  kind: EntityKind,
  owner: Owner,
  pos: Vec2,
): Entity {
  const stats = resolveEntityStatsForOwner(kind, state.races, owner);

  const entity: Entity = {
    id: state.nextId++,
    kind,
    owner,
    pos: { ...pos },
    tileW: stats.tileW,
    tileH: stats.tileH,
    hp: stats.hp,
    hpMax: stats.hp,
    cmd: null,
    sightRadius: stats.sight,
    statHpMax: stats.hp,
    statArmor: stats.armor,
  };

  applyResolvedStatsToEntity(entity, stats, state);
  if (entity.statHpMax && entity.statHpMax !== entity.hpMax) {
    entity.hpMax = entity.statHpMax;
    entity.hp = entity.statHpMax;
  }

  state.entities.push(entity);
  getEntityIndex(state).set(entity.id, entity);
  updateBlockedFootprint(state, entity, true);
  return entity;
}

export function killEntity(state: GameState, id: number): void {
  const idx = state.entities.findIndex(e => e.id === id);
  if (idx !== -1) {
    updateBlockedFootprint(state, state.entities[idx], false);
    state.entities.splice(idx, 1);
  }
  state.entityById?.delete(id);
}

export function getEntity(state: GameState, id: number): Entity | undefined {
  return getEntityIndex(state).get(id);
}

/** All entities whose footprint overlaps tile (tx, ty). */
export function entitiesAt(state: GameState, tx: number, ty: number): Entity[] {
  return state.entities.filter(e =>
    tx >= e.pos.x && tx < e.pos.x + e.tileW &&
    ty >= e.pos.y && ty < e.pos.y + e.tileH,
  );
}

/** True if any non-unit entity (building, wall, mine) occupies (tx, ty). */
export function isTileBlockedByEntity(state: GameState, tx: number, ty: number): boolean {
  if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return false;
  return (state.blockedTiles?.[tileKey(tx, ty)] ?? 0) !== 0;
}
