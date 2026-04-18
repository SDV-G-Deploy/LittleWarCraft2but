export interface KeyState {
  ArrowUp:    boolean;
  ArrowDown:  boolean;
  ArrowLeft:  boolean;
  ArrowRight: boolean;
}

export interface KeyInput {
  state: KeyState;
  destroy: () => void;
}

const TRACKED = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

export function createKeyState(): KeyInput {
  const state: KeyState = {
    ArrowUp: false, ArrowDown: false,
    ArrowLeft: false, ArrowRight: false,
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (TRACKED.has(e.key)) {
      (state as unknown as Record<string, boolean>)[e.key] = true;
      e.preventDefault(); // stop page scroll
    }
  };

  const onKeyUp = (e: KeyboardEvent) => {
    if (TRACKED.has(e.key)) {
      (state as unknown as Record<string, boolean>)[e.key] = false;
    }
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  return {
    state,
    destroy() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    },
  };
}
