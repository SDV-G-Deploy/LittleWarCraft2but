import type { MapData, MapId } from '../../types';
import { buildMap01 } from './map01';
import { buildMap02 } from './map02';
import { buildMap03 } from './map03';
import { buildMap04 } from './map04';
import { buildMap05 } from './map05';
import { buildMap06 } from './map06';

export interface MapCatalogEntry {
  id: MapId;
  name: string;
  desc: string[];
  build: () => MapData;
}

export const MAP_CATALOG: MapCatalogEntry[] = [
  {
    id: 1,
    name: 'Verdant Hills',
    desc: ['Open-field default with scattered forest.', 'Flexible macro and flanks.', 'Baseline 1v1 pacing.'],
    build: buildMap01,
  },
  {
    id: 2,
    name: 'River Crossing',
    desc: ['Horizontal river with two fords.', 'Strong choke timings.', 'Fight for bridgehead control.'],
    build: buildMap02,
  },
  {
    id: 3,
    name: 'Open Steppe',
    desc: ['Very open pressure map.', 'Watch posts reward active scouting.', 'Exposed center mine.'],
    build: buildMap03,
  },
  {
    id: 4,
    name: 'Stone Fords',
    desc: ['Vertical river split.', 'Watch posts frame the ford war.', 'Punishes late repositioning.'],
    build: buildMap04,
  },
  {
    id: 5,
    name: 'Timber Lanes',
    desc: ['Forest corridor / positional map.', 'Rock blockers sharpen lane pivots.', 'Rewards setup and timing.'],
    build: buildMap05,
  },
  {
    id: 6,
    name: 'Crown Pit',
    desc: ['Central contest map.', 'Watch posts and rocks shape pit entries.', 'Center control snowballs economy.'],
    build: buildMap06,
  },
];

export function buildMapById(mapId: MapId): MapData {
  return MAP_CATALOG.find((m) => m.id === mapId)?.build() ?? buildMap01();
}
