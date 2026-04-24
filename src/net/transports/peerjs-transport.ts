import Peer, { DataConnection } from 'peerjs';
import type { NetMode } from '../session-core';
import type { SessionStatusView, TransportCoreBridge } from '../transport-types';

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

function setupConn(c: DataConnection, core: TransportCoreBridge, session: SessionStatusView): void {
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
    console.info(`[net:rtc] setup ${session.getStats().netDebugSummary}`);
    pc.addEventListener('iceconnectionstatechange', () => {
      core.updateRtcState({ iceConnectionState: pc.iceConnectionState });
      console.info(`[net:rtc] iceConnectionState=${pc.iceConnectionState} ${session.getStats().netDebugSummary}`);
    });
    pc.addEventListener('connectionstatechange', () => {
      core.updateRtcState({ connectionState: pc.connectionState });
      console.info(`[net:rtc] connectionState=${pc.connectionState} ${session.getStats().netDebugSummary}`);
    });
    pc.addEventListener('icegatheringstatechange', () => {
      core.updateRtcState({ iceGatheringState: pc.iceGatheringState });
      console.info(`[net:rtc] iceGatheringState=${pc.iceGatheringState} ${session.getStats().netDebugSummary}`);
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

export async function wirePeerJsTransport(params: {
  role: 'host' | 'guest';
  hostCode?: string;
  netMode: NetMode;
  core: TransportCoreBridge;
  session: SessionStatusView;
}): Promise<{ destroyPeer: () => void }> {
  const { role, hostCode, netMode, core, session } = params;
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

  peer.on('open', (id) => {
    if (role === 'host') {
      session.code = id;
      session.status = 'waiting';
      session.statusMsg = `Room code: ${id}`;
      session.onStatusChange?.();
      peer.on('connection', (c) => setupConn(c, core, session));
    } else {
      session.status = 'connecting';
      session.statusMsg = 'Connecting to host…';
      session.onStatusChange?.();
      const c = peer.connect(hostCode!, { reliable: true, serialization: 'json' });
      setupConn(c, core, session);
    }
  });

  peer.on('error', (err) => core.onPeerError((err as Error).message));

  return { destroyPeer: () => peer.destroy() };
}
