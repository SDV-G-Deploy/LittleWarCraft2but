/**
 * session.ts
 * Session orchestration over transport adapters.
 */

import type { Race } from '../types';
import {
  createSessionCore,
  type SessionConfig,
  type NetMode,
  type NetSession,
} from './session-core';
import { wirePeerJsTransport } from './transports/peerjs-transport';

export type { SessionStatus, SessionConfig, SessionStats, TickExchange, NetMode, NetSession } from './session-core';

export async function createSession(
  role: 'host' | 'guest',
  hostCode?: string,
  hostConfig?: Pick<SessionConfig, 'race' | 'mapId'>,
  guestRace?: Race,
  netMode: NetMode = 'selfhost',
): Promise<NetSession> {
  const core = createSessionCore({
    role,
    hostCode,
    hostConfig,
    guestRace,
    netMode,
    destroyPeer: () => undefined,
  });

  const { destroyPeer } = await wirePeerJsTransport({
    role,
    hostCode,
    netMode,
    core,
    session: core.session,
  });

  const originalDestroy = core.session.destroy;
  core.session.destroy = () => {
    originalDestroy();
    destroyPeer();
  };

  return core.session;
}
