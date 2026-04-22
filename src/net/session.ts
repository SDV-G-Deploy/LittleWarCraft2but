/**
 * session.ts
 * Session orchestration over transport adapters.
 */

import type { Race } from '../types';
import {
  createSessionCore,
  type SessionConfig,
  type NetMode,
  type TransportMode,
  type NetSession,
} from './session-core';
import { wirePeerJsTransport } from './transports/peerjs-transport';
import { wireWsRelayTransport } from './transports/ws-relay-transport';

export type { SessionStatus, SessionConfig, SessionStats, TickExchange, NetMode, NetSession, TransportMode } from './session-core';

export async function createSession(
  role: 'host' | 'guest',
  hostCode?: string,
  hostConfig?: Pick<SessionConfig, 'race' | 'mapId'>,
  guestRace?: Race,
  netMode: NetMode = 'selfhost',
  transportMode: TransportMode = 'peerjs',
): Promise<NetSession> {
  const core = createSessionCore({
    role,
    hostCode,
    hostConfig,
    guestRace,
    netMode,
    transportMode,
    destroyPeer: () => undefined,
  });

  const { destroyPeer } = transportMode === 'ws-relay'
    ? await wireWsRelayTransport({
      role,
      hostCode,
      core,
      session: core.session,
    })
    : await wirePeerJsTransport({
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
