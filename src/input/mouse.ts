const DRAG_THRESHOLD = 5; // pixels of travel before it becomes a drag

export interface ClickEvent {
  x: number; y: number;
  button: 0 | 2;
}

export interface DragSelectEvent {
  x1: number; y1: number; // screen-space, always top-left ≤ bottom-right
  x2: number; y2: number;
}

export interface MouseState {
  x: number;
  y: number;
  buttons: number;
  onCanvas: boolean;
  shiftHeld: boolean;
  clicks: ClickEvent[];
  dragSelects: DragSelectEvent[];
  /** Non-null while left-button is held and dragging — used to draw live box. */
  activeDrag: { x1: number; y1: number; x2: number; y2: number } | null;
}

export interface MouseInput {
  state: MouseState;
  destroy: () => void;
}

export function createMouseState(canvas: HTMLCanvasElement): MouseInput {
  const state: MouseState = {
    x: 0, y: 0, buttons: 0, onCanvas: false, shiftHeld: false,
    clicks: [], dragSelects: [], activeDrag: null,
  };

  const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Shift') state.shiftHeld = true; };
  const onKeyUp   = (e: KeyboardEvent) => { if (e.key === 'Shift') state.shiftHeld = false; };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  let downX = 0;
  let downY = 0;
  let leftHeld = false;

  const onMouseEnter = () => { state.onCanvas = true; };
  const onMouseLeave = () => { state.onCanvas = false; state.buttons = 0; state.activeDrag = null; leftHeld = false; };

  canvas.addEventListener('mouseenter', onMouseEnter);
  canvas.addEventListener('mouseleave', onMouseLeave);

  const onMouseMove = (e: MouseEvent) => {
    const r = canvas.getBoundingClientRect();
    state.x = e.clientX - r.left;
    state.y = e.clientY - r.top;
    state.buttons = e.buttons;

    if (leftHeld) {
      const dx = state.x - downX;
      const dy = state.y - downY;
      if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
        state.activeDrag = {
          x1: Math.min(downX, state.x), y1: Math.min(downY, state.y),
          x2: Math.max(downX, state.x), y2: Math.max(downY, state.y),
        };
      }
    }
  };

  canvas.addEventListener('mousemove', onMouseMove);

  const onMouseDown = (e: MouseEvent) => {
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    state.buttons = e.buttons;

    if (e.button === 0) {
      downX = x; downY = y; leftHeld = true;
    } else if (e.button === 2) {
      state.clicks.push({ x, y, button: 2 });
    }
  };

  canvas.addEventListener('mousedown', onMouseDown);

  const onMouseUp = (e: MouseEvent) => {
    state.buttons = e.buttons;
    if (e.button === 0 && leftHeld) {
      const r = canvas.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;

      if (state.activeDrag) {
        state.dragSelects.push({ ...state.activeDrag });
        state.activeDrag = null;
      } else {
        state.clicks.push({ x, y, button: 0 });
      }
      leftHeld = false;
    }
  };

  canvas.addEventListener('mouseup', onMouseUp);

  const onContextMenu = (e: MouseEvent) => e.preventDefault();

  canvas.addEventListener('contextmenu', onContextMenu);

  return {
    state,
    destroy() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      canvas.removeEventListener('mouseenter', onMouseEnter);
      canvas.removeEventListener('mouseleave', onMouseLeave);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mousedown', onMouseDown);
      canvas.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('contextmenu', onContextMenu);
    },
  };
}
