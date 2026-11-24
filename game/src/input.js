// Keyboard and mouse input. Held keys are read every frame; one-shot presses are queued
// as edge flags and taken once, so a press between two frames is never lost or counted
// twice. Mouse coordinates are reported in logical screen pixels (1280x720); the renderer
// owns the scale from the window to that space.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;

const PAUSE_KEYS = new Set(['KeyP', 'Escape']);
const CONFIRM_KEYS = new Set(['Enter', 'Space']);

export function createInput(canvas) {
  const held = new Set();
  const pressed = new Set();
  const mouse = { x: 640, y: 360, down: false, clicked: false };
  let actions = 0;

  window.addEventListener('keydown', (event) => {
    if (CONFIRM_KEYS.has(event.code) && !event.repeat) actions |= ACTION_CONFIRM;
    else if (PAUSE_KEYS.has(event.code) && !event.repeat) actions |= ACTION_PAUSE;
    if (!event.repeat) pressed.add(event.code);
    held.add(event.code);
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
  });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    held.clear();
    mouse.down = false;
  });
  window.addEventListener('mousemove', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 1280;
    mouse.y = ((event.clientY - rect.top) / rect.height) * 720;
  });
  canvas.addEventListener('mousedown', (event) => {
    if (event.button === 0) {
      mouse.down = true;
      mouse.clicked = true;
      actions |= ACTION_CONFIRM;
    }
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) mouse.down = false;
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  return {
    mouse,
    /** True while the key is held down. */
    isDown(code) {
      return held.has(code);
    },
    /** True once, on the frame the key went down. */
    wasPressed(code) {
      return pressed.has(code);
    },
    /** Clear the edge flags now, so a second fixed step in the same frame sees no press. */
    consumeEdges() {
      pressed.clear();
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** -1..1 steering from A/D or the arrow keys. */
    steer() {
      const left = held.has('KeyA') || held.has('ArrowLeft');
      const right = held.has('KeyD') || held.has('ArrowRight');
      return (right ? 1 : 0) - (left ? 1 : 0);
    },
    /** -1..1 throttle from W/S or the arrow keys (forward is positive). */
    throttle() {
      const up = held.has('KeyW') || held.has('ArrowUp');
      const down = held.has('KeyS') || held.has('ArrowDown');
      return (up ? 1 : 0) - (down ? 1 : 0);
    },
    /** On-foot wish direction, normalised, from WASD or the arrows. */
    move() {
      const x = this.steer();
      const up = held.has('KeyW') || held.has('ArrowUp');
      const down = held.has('KeyS') || held.has('ArrowDown');
      const y = (down ? 1 : 0) - (up ? 1 : 0);
      const len = Math.hypot(x, y);
      return len > 0 ? { x: x / len, y: y / len } : { x: 0, y: 0 };
    },
    /** Clear the edge flags; the loop calls this once per frame, after the step. */
    endFrame() {
      pressed.clear();
      mouse.clicked = false;
    },
  };
}
