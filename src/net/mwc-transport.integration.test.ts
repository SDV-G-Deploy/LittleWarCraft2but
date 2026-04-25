import { strict as assert } from 'node:assert';
import { setTimeout as delay } from 'node:timers/promises';
import { wireMwcTransport } from './transports/mwc-transport';
import type { SessionStatus, SessionStats } from './session-core';
import type { CoreTransport, TransportCoreBridge, WireMessage } from './transport-types';

class ProbeCore implements TransportCoreBridge {
  transport: CoreTransport | null = null;
  opens = 0;
  closes = 0;
  connErrors: string[] = [];
  peerErrors: string[] = [];
  inbound: unknown[] = [];

  attachTransport(transport: CoreTransport): void {
    this.transport = transport;
  }

  onConnOpen(): void {
    this.opens += 1;
  }

  onConnData(raw: unknown): void {
    this.inbound.push(raw);
  }

  onConnClose(): void {
    this.closes += 1;
  }

  onConnError(rawMessage: string): void {
    this.connErrors.push(rawMessage);
  }

  onPeerError(rawMessage: string): void {
    this.peerErrors.push(rawMessage);
  }

  updateRtcState(): void {
    // no-op for non-WebRTC transport
  }
}

function makeSession(): {
  code: string;
  status: SessionStatus;
  statusMsg: string;
  onStatusChange?: () => void;
  getStats(): SessionStats;
} {
  return {
    code: '',
    status: 'init',
    statusMsg: 'init',
    getStats() {
      return {
        waitingStallTicks: 0,
        remoteAnnouncedUpToTick: -1,
        remoteContiguousUpToTick: -1,
        currentDelayTicks: 0,
        outboundPendingTicks: 0,
        queuedRemoteTicks: 0,
        queuedLocalTicks: 0,
        lastPacketAgeMs: null,
        lastInboundSummary: null,
        rtcIceConnectionState: null,
        rtcConnectionState: null,
        rtcIceGatheringState: null,
        localExchangeGapMs: null,
        localStallLikely: false,
        netDebugSummary: 'n/a',
      };
    },
  };
}

async function waitFor(predicate: () => boolean, timeoutMs: number, stepMs = 20): Promise<void> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (predicate()) return;
    await delay(stepMs);
  }
  throw new Error(`waitFor timeout ${timeoutMs}ms`);
}

async function main(): Promise<void> {
  process.env.VITE_MWC_WS_URL = process.env.VITE_MWC_WS_URL || 'ws://127.0.0.1:8787/mwc';

  const hostCore = new ProbeCore();
  const guestCore = new ProbeCore();
  const hostSession = makeSession();
  const guestSession = makeSession();

  const hostWired = await wireMwcTransport({ role: 'host', core: hostCore, session: hostSession });
  await waitFor(() => hostSession.code.length > 0, 5_000);

  const guestWired = await wireMwcTransport({ role: 'guest', hostCode: hostSession.code, core: guestCore, session: guestSession });

  await waitFor(() => hostCore.opens === 1 && guestCore.opens === 1, 8_000);

  hostCore.transport?.send({ type: 'config', race: 'human', guestRace: 'orc', mapId: 1 });

  await waitFor(
    () => guestCore.inbound.some((msg) => {
      const wire = msg as Partial<WireMessage>;
      return wire.type === 'config' && wire.race === 'human' && wire.guestRace === 'orc' && wire.mapId === 1;
    }),
    4_000,
  );

  assert.equal(hostCore.connErrors.length, 0, `host conn errors: ${hostCore.connErrors.join(', ')}`);
  assert.equal(guestCore.connErrors.length, 0, `guest conn errors: ${guestCore.connErrors.join(', ')}`);

  hostWired.destroyPeer();
  await waitFor(() => hostCore.closes >= 1, 3_000);

  await delay(1_000);
  assert.equal(hostCore.opens, 1, 'LW2B mwc transport unexpectedly auto-resumed after close');

  guestWired.destroyPeer();

  console.log('mwc transport integration ok');
  console.log(`endpoint=${process.env.VITE_MWC_WS_URL} room=${hostSession.code} hostStatus=${hostSession.status} guestStatus=${guestSession.status}`);
}

void main();
