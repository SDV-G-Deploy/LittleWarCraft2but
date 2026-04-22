/**
 * session.ts
 * PeerJS wrapper with input-buffering and a one-shot config handshake.
 */

import Peer, { DataConnection } from 'peerjs';
import type { Race } from '../types';
import {
  createSessionCore,
  type SessionConfig,
  type NetMode,
  type NetSession,
} from './session-core';

interface RuntimePeerConfig {
  host: string;
  port: number;
  path: string;
  secure: boolean;
}

interface RuntimeNetConfig {
  peer: RuntimePeerConfig;
  iceServers: RTCIceServer[];
}

interface RuntimeIceConfigResponse {
  iceServers?: RTCIceServer[];
}

function parseBooleanEnv(value: string | undefined, fallback: boolean): boolean {
  if (value == null || value.trim() === '') return fallback;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function parseNumberEnv(value: string | undefined, fallback: number): number {
  if (value == null || value.trim() === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizePath(path: string | undefined, fallback: string): string {
  const raw = (path ?? fallback).trim();
  if (!raw) return fallback;
  const withLeading = raw.startsWith('/') ? raw : `/${raw}`;
  return withLeading.endsWith('/') ? withLeading : `${withLeading}/`;
}

function defaultPeerHost(): string {
  if (typeof window !== 'undefined' && window.location.hostname && window.location.hostname !== 'localhost') {
    return window.location.hostname;
  }
  return '0.peerjs.com';
}

function defaultPeerSecure(): boolean {
  if (typeof window !== 'undefined') return window.location.protocol === 'https:';
  return true;
}

function parseIceServers(raw: string | undefined): RTCIceServer[] | null {
  if (!raw || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((entry): entry is RTCIceServer => !!entry && typeof entry === 'object' && 'urls' in entry);
  } catch {
    return null;
  }
}

function getPublicNetConfig(): RuntimeNetConfig {
  return {
    peer: { host: '0.peerjs.com', port: 443, path: '/', secure: true },
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }],
  };
}

function getSelfHostedNetConfig(): RuntimeNetConfig {
  const host = (import.meta.env.VITE_PEER_HOST as string | undefined)?.trim() || defaultPeerHost();
  const secure = parseBooleanEnv(import.meta.env.VITE_PEER_SECURE as string | undefined, defaultPeerSecure());
  const port = parseNumberEnv(import.meta.env.VITE_PEER_PORT as string | undefined, secure ? 443 : 9000);
  const path = normalizePath(import.meta.env.VITE_PEER_PATH as string | undefined, '/');
  const iceServers = parseIceServers(import.meta.env.VITE_ICE_SERVERS as string | undefined) ?? [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];

  return { peer: { host, port, path, secure }, iceServers };
}

function getRuntimePeerConfig(mode: NetMode): RuntimeNetConfig {
  return mode === 'public' ? getPublicNetConfig() : getSelfHostedNetConfig();
}

function getRuntimeIceApiUrl(): string {
  const configured = (import.meta.env.VITE_ICE_API_URL as string | undefined)?.trim();
  if (configured) return configured;
  return './api/ice';
}

async function fetchRuntimeIceServers(): Promise<RTCIceServer[] | null> {
  if (typeof window === 'undefined' || typeof fetch !== 'function') return null;
  try {
    const response = await fetch(getRuntimeIceApiUrl(), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as RuntimeIceConfigResponse;
    if (!payload || !Array.isArray(payload.iceServers)) return null;
    return payload.iceServers.filter((entry): entry is RTCIceServer => !!entry && typeof entry === 'object' && 'urls' in entry);
  } catch {
    return null;
  }
}

export type { SessionStatus, SessionConfig, SessionStats, TickExchange, NetMode, NetSession } from './session-core';

export async function createSession(
  role: 'host' | 'guest',
  hostCode?: string,
  hostConfig?: Pick<SessionConfig, 'race' | 'mapId'>,
  guestRace?: Race,
  netMode: NetMode = 'selfhost',
): Promise<NetSession> {
  const runtimeNet = getRuntimePeerConfig(netMode);
  const runtimeIceServers = netMode === 'selfhost' ? await fetchRuntimeIceServers() : null;
  const peer = new Peer({
    host: runtimeNet.peer.host,
    port: runtimeNet.peer.port,
    path: runtimeNet.peer.path,
    secure: runtimeNet.peer.secure,
    debug: 1,
    config: { iceServers: runtimeIceServers ?? runtimeNet.iceServers },
  });

  const core = createSessionCore({
    role,
    hostCode,
    hostConfig,
    guestRace,
    netMode,
    destroyPeer: () => peer.destroy(),
  });

  function setupConn(c: DataConnection) {
    core.attachTransport({
      send: (msg) => c.send(msg),
      close: () => c.close(),
      isOpen: () => !!c.open,
    });

    const pc = (c as DataConnection & { peerConnection?: RTCPeerConnection }).peerConnection;
    if (pc) {
      core.updateRtcState({
        iceConnectionState: pc.iceConnectionState,
        connectionState: pc.connectionState,
        iceGatheringState: pc.iceGatheringState,
      });
      console.info(`[net:rtc] setup ${core.session.getStats().netDebugSummary}`);
      pc.addEventListener('iceconnectionstatechange', () => {
        core.updateRtcState({ iceConnectionState: pc.iceConnectionState });
        console.info(`[net:rtc] iceConnectionState=${pc.iceConnectionState} ${core.session.getStats().netDebugSummary}`);
      });
      pc.addEventListener('connectionstatechange', () => {
        core.updateRtcState({ connectionState: pc.connectionState });
        console.info(`[net:rtc] connectionState=${pc.connectionState} ${core.session.getStats().netDebugSummary}`);
      });
      pc.addEventListener('icegatheringstatechange', () => {
        core.updateRtcState({ iceGatheringState: pc.iceGatheringState });
        console.info(`[net:rtc] iceGatheringState=${pc.iceGatheringState} ${core.session.getStats().netDebugSummary}`);
      });
      pc.addEventListener('icecandidateerror', (ev) => {
        console.warn(`[net:rtc] icecandidateerror url=${ev.url ?? '?'} code=${ev.errorCode} text=${ev.errorText ?? ''}`);
      });
    }

    c.on('open', () => core.onConnOpen());
    c.on('data', (raw) => core.onConnData(raw));
    c.on('close', () => core.onConnClose());
    c.on('error', (err) => core.onConnError((err as Error).message));
  }

  peer.on('open', (id) => {
    if (role === 'host') {
      core.session.code = id;
      core.session.status = 'waiting';
      core.session.statusMsg = `Room code: ${id}`;
      core.session.onStatusChange?.();
      peer.on('connection', (c) => setupConn(c));
    } else {
      core.session.status = 'connecting';
      core.session.statusMsg = 'Connecting to host…';
      core.session.onStatusChange?.();
      const c = peer.connect(hostCode!, { reliable: true, serialization: 'json' });
      setupConn(c);
    }
  });

  peer.on('error', (err) => core.onPeerError((err as Error).message));

  return core.session;
}
