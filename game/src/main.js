// Neon Harbor — boot and the one loop. The world advances in fixed 1/60 s
// steps; the renderer paints it; the DOM overlays carry the title, pause and
// end screens. ?seed=N fixes the city. ?shot=start|street|chase|mission
// (with &seed=N) stages that scene, plays it forward and sets
// window.__shotReady for the screenshot pipeline.

import { createAudio } from './audio.js';
import { createInput } from './input.js';
import { createRenderer } from './render.js';
import { drawHud } from './hud.js';
import { createWorld } from './world.js';
import { fakeInput, stageShot } from './shots.js';
import { clearSave, hasSave, loadGame } from './save.js';
import { updateCars } from './vehicles.js';
import { updatePeds } from './pedestrians.js';

const STEP = 1 / 60;
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const titleScreen = document.getElementById('title-screen');
const pauseScreen = document.getElementById('pause-screen');
const endScreen = document.getElementById('end-screen');
const endTitle = document.getElementById('end-title');
const endSub = document.getElementById('end-sub');

const audio = createAudio();
const renderer = createRenderer(canvas);
const input = createInput(canvas);
let world = createWorld(seed, audio);
let state = 'title'; // title | playing | paused | ended

function show(el, visible) {
  el.classList.toggle('hidden', !visible);
}

function announce(message) {
  status.textContent = message;
}

function startRun(useSave) {
  audio.unlock();
  audio.click();
  if (useSave) {
    const data = loadGame();
    if (data) world = createWorld(data.seed ?? seed, audio, data);
  } else {
    world = createWorld(seed, audio);
  }
  show(titleScreen, false);
  show(pauseScreen, false);
  show(endScreen, false);
  state = 'playing';
  announce('Playing Neon Harbor. Reach the marker to start your first job.');
}

function pauseGame() {
  if (state !== 'playing') return;
  state = 'paused';
  show(pauseScreen, true);
  announce('Paused.');
}

function resumeGame() {
  if (state !== 'paused') return;
  state = 'playing';
  show(pauseScreen, false);
  announce('Playing.');
}

function endRun(kind) {
  state = 'ended';
  if (kind === 'wasted') {
    endTitle.textContent = 'WASTED';
    endTitle.style.color = '#ff5964';
    endSub.textContent = 'Kai went down in the streets of Neon Harbor. The city keeps moving — so do you.';
  } else if (kind === 'busted') {
    endTitle.textContent = 'BUSTED';
    endTitle.style.color = '#4ecdc4';
    endSub.textContent = 'The Harbor PD caught up. Bail is cheap; pride is not.';
  } else {
    endTitle.textContent = 'KING OF THE HARBOR';
    endTitle.style.color = '#ffd166';
    endSub.textContent = `All six jobs done. $${world.money.toLocaleString('en-US')} in the pocket, and Neon Harbor is yours.`;
  }
  show(endScreen, true);
  announce(`${endTitle.textContent}. ${endSub.textContent}`);
}

document.getElementById('btn-start').addEventListener('click', () => startRun(false));
document.getElementById('btn-continue').addEventListener('click', () => startRun(true));
document.getElementById('btn-resume').addEventListener('click', resumeGame);
document.getElementById('btn-restart').addEventListener('click', () => {
  clearSave();
  window.location.reload();
});
document.getElementById('btn-retry').addEventListener('click', () => {
  world.respawn();
  show(endScreen, false);
  state = 'playing';
  announce('Back on the streets.');
});
document.getElementById('btn-menu').addEventListener('click', () => window.location.reload());

// Pause and mute live here, beside the screens; the world consumes the
// gameplay keys (E, R) through the input module.
window.addEventListener('keydown', (event) => {
  if (event.repeat) return;
  if (event.code === 'KeyP' || event.code === 'Escape') {
    if (state === 'playing') pauseGame();
    else if (state === 'paused') resumeGame();
  } else if (event.code === 'KeyM') {
    audio.setMuted(!audio.isMuted());
  }
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state === 'playing') pauseGame();
});

if (hasSave()) document.getElementById('btn-continue').classList.remove('hidden');

// What the verification drivers and the screenshot pipeline read.
window.__game = {
  get world() {
    return world;
  },
  get state() {
    return state;
  },
  start: () => startRun(false),
  version: 'neon-harbor-1',
};

function runShot(name) {
  const scene = stageShot(name, world);
  const size = renderer.size();
  world.view = size;
  const simInput = fakeInput(scene.driving);
  for (let i = 0; i < scene.steps; i++) {
    if (scene.screen === 'title') {
      world.time += STEP;
      updateCars(world, STEP, world.rng);
      updatePeds(world, STEP);
    } else {
      world.update(STEP, simInput);
    }
  }
  if (scene.screen !== 'title') {
    show(titleScreen, false);
    state = 'playing';
  }
  let painted = 0;
  function paint() {
    const view = renderer.draw(world);
    world.view = view;
    if (scene.screen !== 'title') drawHud(canvas.getContext('2d'), world, view.w, view.h, input, 'playing');
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  let accumulator = 0;
  let last = performance.now();

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const view = renderer.size();
    world.view = view;
    if (state === 'playing') {
      while (accumulator >= STEP) {
        world.update(STEP, input);
        accumulator -= STEP;
        if (world.endState) {
          endRun(world.endState);
          break;
        }
      }
    } else if (state === 'title') {
      // The city lives behind the title screen: traffic and pedestrians move.
      while (accumulator >= STEP) {
        world.time += STEP;
        updateCars(world, STEP, world.rng);
        updatePeds(world, STEP);
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    const drawn = renderer.draw(world);
    if (state === 'playing' || state === 'paused' || state === 'ended') {
      drawHud(canvas.getContext('2d'), world, drawn.w, drawn.h, input, state);
    }
  }

  announce('Neon Harbor. Press Start Engine to play.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
