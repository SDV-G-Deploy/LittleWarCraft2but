import type { Entity, EntityKind, Owner, GameState, Vec2 } from '../types';
import { isUnitKind } from '../types';
import { STATS } from '../data/units';

export type EntityLookup = Map<number, Entity>;

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
  const stats = STATS[kind];
  if (!stats) throw new Error(`No stats for ${kind}`);

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
  };

  state.entities.push(entity);
  getEntityIndex(state).set(entity.id, entity);
  return entity;
}

export function killEntity(state: GameState, id: number): void {
  const idx = state.entities.findIndex(e => e.id === id);
  if (idx !== -1) state.entities.splice(idx, 1);
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
  return state.entities.some(e => {
    if (isUnitKind(e.kind)) return false;                 // units don't block tiles
    return tx >= e.pos.x && tx < e.pos.x + e.tileW &&
           ty >= e.pos.y && ty < e.pos.y + e.tileH;
  });
}
