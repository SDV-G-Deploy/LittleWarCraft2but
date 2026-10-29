/** Tiny WebAudio synth for Kingdom OS 2000. No assets; every sound is generated. */

export type Sfx = 'click' | 'buy' | 'upgrade' | 'trophy' | 'mail' | 'error' | 'install' | 'open' | 'boot';

export interface SoundBoard {
  play(sfx: Sfx): void;
  setMuted(muted: boolean): void;
  readonly muted: boolean;
  /** Must be called from a user gesture before the first sound. */
  unlock(): void;
}

type Note = { f: number; t: number; d: number; type?: OscillatorType; g?: number; slide?: number };

const PATTERNS: Record<Sfx, Note[]> = {
  click: [{ f: 880, t: 0, d: 0.05, type: 'triangle', g: 0.5, slide: 1.25 }],
  buy: [
    { f: 523, t: 0, d: 0.07, type: 'square', g: 0.25 },
    { f: 784, t: 0.06, d: 0.1, type: 'square', g: 0.25 },
  ],
  upgrade: [
    { f: 523, t: 0, d: 0.08, type: 'triangle' },
    { f: 659, t: 0.07, d: 0.08, type: 'triangle' },
    { f: 784, t: 0.14, d: 0.08, type: 'triangle' },
    { f: 1047, t: 0.21, d: 0.18, type: 'triangle' },
  ],
  trophy: [
    { f: 784, t: 0, d: 0.1, type: 'sine' },
    { f: 988, t: 0.09, d: 0.1, type: 'sine' },
    { f: 1175, t: 0.18, d: 0.1, type: 'sine' },
    { f: 1568, t: 0.27, d: 0.3, type: 'sine', g: 0.6 },
  ],
  mail: [
    { f: 1319, t: 0, d: 0.18, type: 'sine' },
    { f: 1047, t: 0.16, d: 0.3, type: 'sine' },
  ],
  open: [{ f: 660, t: 0, d: 0.12, type: 'sine', slide: 1.5 }],
  error: [{ f: 140, t: 0, d: 0.14, type: 'sawtooth', g: 0.35 }],
  boot: [
    { f: 392, t: 0, d: 0.5, type: 'sine', g: 0.5 },
    { f: 523, t: 0.12, d: 0.5, type: 'sine', g: 0.5 },
    { f: 659, t: 0.24, d: 0.6, type: 'sine', g: 0.5 },
    { f: 784, t: 0.36, d: 0.8, type: 'triangle', g: 0.4 },
  ],
  install: [
    { f: 262, t: 0, d: 1.2, type: 'sine', g: 0.5 },
    { f: 330, t: 0.15, d: 1.1, type: 'sine', g: 0.45 },
    { f: 392, t: 0.3, d: 1.0, type: 'sine', g: 0.45 },
    { f: 523, t: 0.45, d: 1.0, type: 'triangle', g: 0.4 },
    { f: 1047, t: 0.75, d: 0.9, type: 'sine', g: 0.25 },
  ],
};

export function createSoundBoard(initiallyMuted: boolean): SoundBoard {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let muted = initiallyMuted;
  let lastClick = 0;

  function ensure(): AudioContext | null {
    if (ctx) return ctx;
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
      master = ctx.createGain();
      master.gain.value = 0.16;
      master.connect(ctx.destination);
    } catch {
      ctx = null;
    }
    return ctx;
  }

  return {
    get muted() {
      return muted;
    },
    setMuted(value: boolean) {
      muted = value;
    },
    unlock() {
      const c = ensure();
      if (c && c.state === 'suspended') void c.resume().catch(() => undefined);
    },
    play(sfx: Sfx) {
      if (muted) return;
      const c = ensure();
      if (!c || !master || c.state !== 'running') return;
      const now = c.currentTime;
      // Rapid clicking: keep it crisp and vary the pitch slightly.
      let detune = 0;
      if (sfx === 'click') {
        if (now - lastClick < 0.03) return;
        lastClick = now;
        detune = (Math.random() - 0.5) * 300;
      }
      for (const n of PATTERNS[sfx]) {
        const osc = c.createOscillator();
        const gain = c.createGain();
        osc.type = n.type ?? 'sine';
        osc.frequency.setValueAtTime(n.f, now + n.t);
        if (n.slide) osc.frequency.exponentialRampToValueAtTime(n.f * n.slide, now + n.t + n.d);
        osc.detune.value = detune;
        const peak = n.g ?? 0.4;
        gain.gain.setValueAtTime(0.0001, now + n.t);
        gain.gain.exponentialRampToValueAtTime(peak, now + n.t + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + n.t + n.d);
        osc.connect(gain).connect(master);
        osc.start(now + n.t);
        osc.stop(now + n.t + n.d + 0.05);
      }
    },
  };
}
