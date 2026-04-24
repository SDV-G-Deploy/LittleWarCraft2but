import { MAP_W } from '../../types';

export interface FlowFieldData {
  goalX: number;
  goalY: number;
  dist: Int16Array;
}

export interface FlowFieldCacheStats {
  hits: number;
  misses: number;
  clears: number;
  size: number;
}

function goalKey(goalX: number, goalY: number): number {
  return goalY * MAP_W + goalX;
}

export class FlowFieldCache {
  private map = new Map<number, FlowFieldData>();
  private tick = -1;
  private stats: FlowFieldCacheStats = {
    hits: 0,
    misses: 0,
    clears: 0,
    size: 0,
  };

  beginTick(tick: number): void {
    if (this.tick === tick) return;
    this.tick = tick;
    if (this.map.size > 0) {
      this.map.clear();
      this.stats.clears++;
      this.stats.size = 0;
    }
  }

  get(goalX: number, goalY: number): FlowFieldData | null {
    const key = goalKey(goalX, goalY);
    const data = this.map.get(key) ?? null;
    if (data) this.stats.hits++;
    else this.stats.misses++;
    return data;
  }

  set(field: FlowFieldData): void {
    this.map.set(goalKey(field.goalX, field.goalY), field);
    this.stats.size = this.map.size;
  }

  getStats(): FlowFieldCacheStats {
    return { ...this.stats, size: this.map.size };
  }
}

export function createFlowFieldCache(): FlowFieldCache {
  return new FlowFieldCache();
}
