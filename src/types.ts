// ─── Constants ────────────────────────────────────────────────────────────────

export const TILE_SIZE = 32;
export const MAP_W = 64;
export const MAP_H = 64;
export const SIM_HZ = 20;
export const SIM_TICK_MS = 1000 / SIM_HZ; // 50ms
export const CORPSE_LIFE_TICKS  = SIM_HZ * 3;   // 3 seconds
export const MINE_GOLD_INITIAL  = 1500;
export const GATHER_AMOUNT      = 10;            // gold per trip
export const GATHER_TICKS       = Math.round(SIM_HZ * 1.8); // 1.8s at mine

// ─── Map ──────────────────────────────────────────────────────────────────────

export type TileKind = 'grass' | 'tree' | 'water' | 'goldmine' | 'rock';
export type FogState = 'unseen' | 'explored' | 'visible';

export interface Tile {
  kind: TileKind;
  passable: boolean;
  watchPost?: boolean;
}

// ─── Map data ─────────────────────────────────────────────────────────────────

export type MapId = 1 | 2 | 3 | 4 | 5 | 6;

export interface MapData {
  tiles:       Tile[][];
  playerStart: Vec2;
  aiStart:     Vec2;
  goldMines:   Vec2[];   // top-left tile of each 2×2 mine
  name:        string;
  description: string;
}

// ─── Geometry ─────────────────────────────────────────────────────────────────

export interface Vec2 {
  x: number;
  y: number;
}

// ─── Race ─────────────────────────────────────────────────────────────────────

export type Race = 'human' | 'orc';

// ─── Entities ─────────────────────────────────────────────────────────────────

export type Owner = 0 | 1; // 0 = player, 1 = AI

export type EntityKind =
  | 'worker'  | 'footman' | 'archer' | 'knight'         // human units
  | 'peon'    | 'grunt'   | 'troll'  | 'ogreFighter'    // orc units
  | 'townhall' | 'barracks' | 'farm' | 'wall' | 'tower' // shared buildings (sprite varies by race)
  | 'goldmine'                                           // resource node
  | 'construction';                                      // building-in-progress scaffold

/** Mobile combat/worker units — all races combined */
export const UNIT_KINDS = new Set<EntityKind>([
  'worker', 'footman', 'archer', 'knight',
  'peon',   'grunt',   'troll',  'ogreFighter',
]);
export function isUnitKind(kind: EntityKind): boolean { return UNIT_KINDS.has(kind); }

/** Worker-role units across races */
export const WORKER_KINDS = new Set<EntityKind>(['worker', 'peon']);
export function isWorkerKind(kind: EntityKind): boolean { return WORKER_KINDS.has(kind); }

/** Ranged units across races — skip buildings when attacking */
export const RANGED_UNIT_KINDS = new Set<EntityKind>(['archer', 'troll']);
export function isRangedUnit(kind: EntityKind): boolean { return RANGED_UNIT_KINDS.has(kind); }

export type Command =
  | {
      type: 'move';
      path: Vec2[];
      stepTick: number;
      attackMove: boolean;
      speedMult?: number;
      speedMultUntilTick?: number;
      goal: Vec2;
      lastPos: Vec2;
      lastProgressTick: number;
      repathCount: number;
    }
  | { type: 'attack';  targetId: number; cooldownTick: number; chasePath: Vec2[]; chasePathTick: number }
  | { type: 'gather';  mineId: number; phase: 'tomine' | 'gathering' | 'returning'; waitTicks: number }
  | { type: 'build';   building: EntityKind; pos: Vec2; siteId: number; phase: 'moving' | 'building'; stepTick: number }
  | { type: 'train';   unit: EntityKind; ticksLeft: number; queue: EntityKind[]; openingTempoCommit?: boolean };

export type OpeningPlan = 'eco' | 'tempo' | 'pressure';

export interface Entity {
  id: number;
  kind: EntityKind;
  owner: Owner;
  pos: Vec2;
  tileW: number;
  tileH: number;
  hp: number;
  hpMax: number;
  cmd: Command | null;
  sightRadius: number;
  goldReserve?: number;   // gold mines only
  carryGold?: number;     // workers carrying gold back
  rallyPoint?: Vec2;      // townhall / barracks: newly trained units walk here
  openingPlan?: OpeningPlan; // player-declared early intent for UI + rally support
  constructionOf?: EntityKind;  // 'construction' entities: target building kind
  underAttackTick?: number;     // recent damage marker for UI / harassment readability
  statHpMax?: number;           // optional runtime max HP override for race-specific variants
  statArmor?: number;           // optional runtime armor override for race-specific variants
}

// ─── Corpse ───────────────────────────────────────────────────────────────────

export interface Corpse {
  pos: Vec2;
  owner: Owner;
  deadTick: number;
}

// ─── Game State ───────────────────────────────────────────────────────────────

export interface GameState {
  tick: number;
  tiles: Tile[][];
  fog:   FogState[][];
  entities: Entity[];
  entityById?: Map<number, Entity>;
  blockedTiles?: Uint8Array;
  corpses: Corpse[];
  nextId: number;
  gold:   [number, number];
  pop:    [number, number];
  popCap: [number, number];
  races:  [Race, Race];   // races[0]=player, races[1]=AI
  mapName?: string;
  mapDescription?: string;
  contestedMineBonusUntilTick: number;
  openingPlanSelected: [OpeningPlan | null, OpeningPlan | null];
  openingCommitmentClaimed: [boolean, boolean];
  recentAttackEvents?: AttackVisualEvent[];
  recentProjectileEvents?: ProjectileVisualEvent[];
}

export interface AttackVisualEvent {
  attackerId: number;
  targetId: number;
  tick: number;
  ranged: boolean;
}

export interface ProjectileVisualEvent {
  attackerId: number;
  targetId: number;
  start: Vec2;
  end: Vec2;
  startTick: number;
  durationTicks: number;
}
