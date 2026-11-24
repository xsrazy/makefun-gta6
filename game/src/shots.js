// The screenshot scenes behind ?shot=cover|street|chase|start. Each one plays the real
// rules forward from a fresh seeded world for a few seconds, steered by a small autopilot
// (drive toward a point on the road, brake into turns), so every frame is what a short
// game really looks like — the same seed always gives the same frame. No scene is posed
// by hand: the HUD, the traffic, the police and the mission tracker are all live.

import { STEP } from './config.js';
import { PLACES } from './city.js';
import { createCar } from './vehicles.js';
import { createPed } from './pedestrians.js';
import { addHeat } from './police.js';
import { missionById } from './missions.js';

/** Screen names, matching the boot code's screens. */
export const SCREEN_PLAY = 'play';
export const SCREEN_TITLE = 'title';

function idleControls() {
  return { moveX: 0, moveY: 0, run: false, throttle: 0, steer: 0, handbrake: false, aiming: false, aimX: 0, aimY: 0, firing: false, punch: false, enter: false };
}

/** Steer the player's car toward (tx, ty): full throttle, ease off into sharp turns. */
function driveControls(state, tx, ty) {
  const car = state.player.car;
  const controls = idleControls();
  if (!car) return controls;
  const desired = Math.atan2(ty - car.y, tx - car.x);
  let diff = desired - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  controls.steer = Math.max(-1, Math.min(1, diff * 2.4));
  controls.throttle = Math.abs(diff) > 0.9 ? 0.25 : 1;
  return controls;
}

function putPlayerInCar(state, car) {
  car.driver = 'player';
  state.player.car = car;
  state.player.x = car.x;
  state.player.y = car.y;
  state.player.angle = car.angle;
  state.camera.x = car.x;
  state.camera.y = car.y;
}

function spawnPoliceBehind(state, count, dx, dy) {
  const p = state.player;
  for (let i = 0; i < count; i += 1) {
    const car = createCar('cruiser', p.x + dx + i * 70, p.y + dy + (i % 2) * 50, p.angle, '#101418', 'police');
    car.id = state.nextCarId++;
    car.speed = 200;
    state.cars.push(car);
  }
}

function runSteps(world, seconds, controlsFn) {
  const steps = Math.floor(seconds / STEP);
  for (let i = 0; i < steps; i += 1) world.step(controlsFn(world.state), STEP);
}

function stageCover(world) {
  const state = world.state;
  // Danny in a red Vortex R, tearing east through Downtown, two stars on the tail.
  const car = createCar('sports', 1900, 1500, 0, '#ff3b30', 'parked');
  car.id = state.nextCarId++;
  car.speed = 380;
  state.cars.push(car);
  putPlayerInCar(state, car);
  addHeat(state, 60);
  spawnPoliceBehind(state, 2, -260, 30);
  world.beginMission(missionById(2));
  runSteps(world, 2.6, (s) => driveControls(s, s.player.x + 900, 1500));
  return { screen: SCREEN_PLAY };
}

function stageStreet(world) {
  const state = world.state;
  // On foot in Sun Plaza at lunchtime: crowds, traffic, and a car worth stealing.
  state.player.x = PLACES.plaza.x;
  state.player.y = PLACES.plaza.y;
  state.player.angle = Math.PI / 2;
  state.camera.x = PLACES.plaza.x;
  state.camera.y = PLACES.plaza.y;
  for (let i = 0; i < 22; i += 1) {
    const ped = createPed(
      PLACES.plaza.x + (state.random() - 0.5) * 700,
      PLACES.plaza.y + (state.random() - 0.5) * 500,
      state.random,
    );
    ped.target = {
      x: PLACES.plaza.x + (state.random() - 0.5) * 700,
      y: PLACES.plaza.y + (state.random() - 0.5) * 500,
    };
    state.peds.push(ped);
  }
  const car = createCar('coupe', PLACES.plaza.x + 90, PLACES.plaza.y + 120, 0, '#2fb8a6', 'parked');
  car.id = state.nextCarId++;
  state.cars.push(car);
  world.beginMission(missionById(1));
  runSteps(world, 2.2, () => idleControls());
  return { screen: SCREEN_PLAY };
}

function stageChase(world) {
  const state = world.state;
  // Four stars on the coastal road: the Sunset Getaway, cops boxing in from behind.
  const car = createCar('sports', 3000, 3250, Math.PI, '#1f6fff', 'parked');
  car.id = state.nextCarId++;
  car.speed = 520;
  state.cars.push(car);
  putPlayerInCar(state, car);
  world.beginMission(missionById(5));
  addHeat(state, 90);
  spawnPoliceBehind(state, 3, 280, 20);
  runSteps(world, 3.4, (s) => driveControls(s, s.player.x - 900, 3250));
  return { screen: SCREEN_PLAY };
}

function stageStart(world) {
  // The title screen: the camera drifts over Downtown while the city lives.
  for (let i = 0; i < 4 / STEP; i += 1) world.stepAttract(STEP);
  return { screen: SCREEN_TITLE };
}

/**
 * Set `world` to the named scene (cover, street, chase or start; any other name is
 * start) and return the screen to draw over it.
 */
export function stageShot(name, world) {
  if (name === 'cover') return stageCover(world);
  if (name === 'street') return stageStreet(world);
  if (name === 'chase') return stageChase(world);
  return stageStart(world);
}
