import type { TickPacket } from './netcmd';
import type { SessionStatus, SessionStats } from './session-core';

export type WireMessage =
  | { type: 'hello'; race: string }
  | { type: 'config'; race: string; guestRace: string; mapId: number }
  | (TickPacket & { type?: undefined });

export interface CoreTransport {
  send(msg: WireMessage): void;
  close(): void;
  isOpen(): boolean;
}

export interface TransportRtcStatePatch {
  iceConnectionState?: RTCIceConnectionState | null;
  connectionState?: RTCPeerConnectionState | null;
  iceGatheringState?: RTCIceGatheringState | null;
}

export interface TransportCoreBridge {
  attachTransport(transport: CoreTransport): void;
  onConnOpen(): void;
  onConnData(raw: unknown): void;
  onConnClose(): void;
  onConnError(rawMessage: string): void;
  onPeerError(rawMessage: string): void;
  updateRtcState(state: TransportRtcStatePatch): void;
}

export interface SessionStatusView {
  code: string;
  status: SessionStatus;
  statusMsg: string;
  onStatusChange?: () => void;
  getStats(): SessionStats;
}
