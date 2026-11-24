// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s
// steps (several in a slow frame, none in a fast one), and the renderer paints what is
// there. The game moves between five screens: title, play, paused, wasted and busted.
//
// ?seed=N fixes the city and the traffic. ?shot=cover|street|chase|start (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.

import { STEP } from './config.js';
import { createWorld, EVENT_BUSTED, EVENT_CASH, EVENT_CRASH, EVENT_EXPLOSION, EVENT_MISSION_FAILED, EVENT_MISSION_PASSED, EVENT_PICKUP, EVENT_PUNCH, EVENT_SHOT, EVENT_WANTED_UP, EVENT_WASTED } from './world.js';
import { ACTION_CONFIRM, ACTION_PAUSE, createInput } from './input.js';
import { createRenderer } from './render.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { nearestPoliceDistance } from './police.js';
import { stageShot } from './shots.js';
import { hasSave, loadGame, saveGame } from './save.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_WASTED = 'wasted';
export const SCREEN_BUSTED = 'busted';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const renderer = createRenderer(canvas);
const hud = createHud();
const audio = createAudio();

function randomSeed() {
  return Math.floor(Math.random() * 4294967296);
}

function runShot(name) {
  const world = createWorld(seed, null);
  window.__world = world;
  const scene = stageShot(name, world);
  const state = world.state;
  const ui = {
    mouse: name === 'street' ? { x: 880, y: 250 } : { x: 640, y: 360 },
    objective: world.currentObjective(),
    hint: name === 'street' ? 'Press E to steal the Solstice GT' : null,
    dt: 0,
    hasSave: false,
    showControls: false,
  };
  let painted = 0;
  function paint() {
    renderer.draw(state, ui.objective);
    if (scene.screen === SCREEN_TITLE) hud.drawTitle(renderer.context, state, ui);
    else hud.drawHud(renderer.context, state, ui);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let world = createWorld(seed, null);
  // Debug hook for the playtest driver: the live world, readable from the console.
  window.__world = world;
  let screen = SCREEN_TITLE;
  let showControls = false;
  let saveMessage = null;
  let saveMessageTimer = 0;
  let accumulator = 0;
  let last = performance.now();

  // Screen readers (and anyone watching the page's text) hear the screen changes.
  function announce(message) {
    status.textContent = message;
  }

  function startNewGame() {
    audio.unlock();
    audio.click();
    world = createWorld(randomSeed(), null);
    window.__world = world;
    screen = SCREEN_PLAY;
    announce('Playing Solmar Bay. Mission 1: First Wheels.');
  }

  function continueGame() {
    audio.unlock();
    audio.click();
    const save = loadGame();
    world = createWorld(randomSeed(), save);
    window.__world = world;
    screen = SCREEN_PLAY;
    announce('Continuing Solmar Bay.');
  }

  function quitToTitle() {
    audio.click();
    screen = SCREEN_TITLE;
    showControls = false;
    announce('Solmar Bay. Title screen.');
  }

  function handleEvents(events) {
    if (events & EVENT_SHOT) audio.shot();
    if (events & EVENT_PUNCH) audio.punch();
    if (events & EVENT_CRASH) audio.crash();
    if (events & EVENT_PICKUP) audio.pickup();
    if (events & EVENT_CASH) audio.cash();
    if (events & EVENT_WANTED_UP) audio.wantedUp();
    if (events & EVENT_EXPLOSION) audio.explosion();
    if (events & EVENT_MISSION_PASSED) {
      audio.missionComplete();
      announce('Mission passed.');
    }
    if (events & EVENT_MISSION_FAILED) audio.missionFailed();
    if (events & EVENT_WASTED) {
      audio.missionFailed();
      screen = SCREEN_WASTED;
      announce('Wasted. Bay General Hospital patched you up.');
    }
    if (events & EVENT_BUSTED) {
      audio.busted();
      screen = SCREEN_BUSTED;
      announce('Busted. The SBPD took their cut.');
    }
  }

  function buildControls() {
    const move = input.move();
    const aim = renderer.toWorld(input.mouse.x, input.mouse.y, world.state.camera);
    const p = world.state.player;
    return {
      moveX: move.x,
      moveY: move.y,
      run: input.isDown('ShiftLeft') || input.isDown('ShiftRight'),
      throttle: input.throttle(),
      steer: input.steer(),
      handbrake: input.isDown('Space'),
      aiming: !p.car,
      aimX: aim.x,
      aimY: aim.y,
      firing: input.mouse.down && !p.car,
      punch: input.wasPressed('KeyF'),
      enter: input.wasPressed('KeyE'),
    };
  }

  function computeHint() {
    const state = world.state;
    const p = state.player;
    if (p.car) {
      const d = Math.hypot(p.x - 1250, p.y - 1250);
      if (d < 160 && (p.car.health < p.car.maxHealth * 0.9 || state.wanted > 0)) {
        return 'Solano Garage: drive in to repair and clear your wanted level';
      }
      return 'E — Exit car   ·   Space — Handbrake';
    }
    let best = null;
    let bestDist = 78;
    for (const car of state.cars) {
      if (car.dead) continue;
      const d = Math.hypot(car.x - p.x, p.y - p.y);
      if (d < bestDist) { bestDist = d; best = car; }
    }
    if (best) return `Press E to steal the ${best.type.name}`;
    return null;
  }

  function clickButton() {
    if (!input.mouse.clicked) return null;
    for (const b of hud.buttons()) {
      if (input.mouse.x >= b.x && input.mouse.x <= b.x + b.w && input.mouse.y >= b.y && input.mouse.y <= b.y + b.h) {
        return b.id;
      }
    }
    return null;
  }

  function handleTitleInput(actions) {
    const clicked = clickButton();
    if (clicked === 'new') startNewGame();
    else if (clicked === 'continue') continueGame();
    else if (clicked === 'controls') {
      showControls = !showControls;
      audio.click();
    } else if (actions & ACTION_CONFIRM) {
      if (hasSave()) continueGame();
      else startNewGame();
    }
  }

  function handlePauseInput(actions) {
    const clicked = clickButton();
    if (clicked === 'resume' || (actions & (ACTION_PAUSE | ACTION_CONFIRM))) {
      screen = SCREEN_PLAY;
      announce('Playing.');
      return;
    }
    if (clicked === 'save' || input.wasPressed('KeyS')) {
      if (saveGame(world.state)) {
        saveMessage = 'SAVED!';
        saveMessageTimer = 2;
        audio.cash();
      } else {
        saveMessage = 'SAVE FAILED';
        saveMessageTimer = 2;
      }
      return;
    }
    if (clicked === 'restart' || input.wasPressed('KeyR')) {
      if (world.restartMission()) {
        screen = SCREEN_PLAY;
        announce('Mission restarted.');
      }
      return;
    }
    if (clicked === 'quit' || input.wasPressed('KeyQ')) quitToTitle();
  }

  function stepGame(dt) {
    const controls = buildControls();
    const events = world.step(controls, dt);
    // Edge-triggered presses belong to exactly one fixed step, not every step this frame.
    input.consumeEdges();
    handleEvents(events);
    // Continuous sounds follow the state.
    const p = world.state.player;
    if (p.car && !p.car.dead) audio.engine(Math.abs(p.car.speed) / p.car.type.topSpeed, true);
    else audio.engine(0, false);
    audio.siren(world.state.wanted > 0 && nearestPoliceDistance(world.state) < 650);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const frameDt = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const actions = input.takeActions();

    if (input.wasPressed('KeyM')) {
      audio.setMuted(!audio.isMuted());
      announce(audio.isMuted() ? 'Sound muted.' : 'Sound on.');
    }
    if (saveMessageTimer > 0) {
      saveMessageTimer -= frameDt;
      if (saveMessageTimer <= 0) saveMessage = null;
    }

    if (screen === SCREEN_TITLE) {
      handleTitleInput(actions);
      world.stepAttract(frameDt);
    } else if (screen === SCREEN_PLAY) {
      if (actions & ACTION_PAUSE) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
        audio.engine(0, false);
        audio.siren(false);
      } else {
        accumulator += frameDt;
        while (accumulator >= STEP) {
          stepGame(STEP);
          accumulator -= STEP;
          if (screen !== SCREEN_PLAY) {
            accumulator = 0;
            break;
          }
        }
      }
    } else if (screen === SCREEN_PAUSED) {
      handlePauseInput(actions);
    } else if (screen === SCREEN_WASTED || screen === SCREEN_BUSTED) {
      if (actions & ACTION_CONFIRM) {
        world.respawn(screen === SCREEN_WASTED ? 'hospital' : 'police');
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    }

    const state = world.state;
    const ui = {
      mouse: input.mouse,
      objective: world.currentObjective(),
      hint: screen === SCREEN_PLAY ? computeHint() : null,
      dt: frameDt,
      hasSave: hasSave(),
      showControls,
      saveMessage,
    };
    renderer.draw(state, ui.objective);
    if (screen === SCREEN_TITLE) hud.drawTitle(renderer.context, state, ui);
    else if (screen === SCREEN_PAUSED) {
      hud.drawHud(renderer.context, state, ui);
      hud.drawPause(renderer.context, state, ui);
    } else if (screen === SCREEN_WASTED) hud.drawEnd(renderer.context, 'wasted');
    else if (screen === SCREEN_BUSTED) hud.drawEnd(renderer.context, 'busted');
    else hud.drawHud(renderer.context, state, ui);
    input.endFrame();
  }

  // Leaving the tab pauses a running game rather than letting the city run unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Solmar Bay. Press Enter to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
