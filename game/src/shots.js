// Neon Harbor — the screenshot scenes behind ?shot=start|street|chase|mission.
// Each one stages the real game (a real car, real cops, a real mission in
// progress) and then lets it run forward a few seconds, so the captured frame
// is a moment of genuine play and the same seed always gives the same frame.

import { makeCar } from './vehicles.js';

export const FAKE_MOUSE = { x: 900, y: 400, down: false };

export function fakeInput(driving) {
  return {
    mouse: FAKE_MOUSE,
    isDown: () => false,
    axes: () => (driving ? { x: 0, y: -1 } : { x: 0, y: 0 }),
    sprint: () => false,
    handbrake: () => false,
    takeActions: () => 0,
    takeClick: () => false,
  };
}

function putPlayerInCar(world, x, y, angle) {
  const car = world.cars.find((c) => c.driver === 'parked' && !c.dead) || world.cars[0];
  car.x = x;
  car.y = y;
  car.angle = angle;
  car.speed = 0;
  world.player.x = x;
  world.player.y = y;
  world.enterCar(car);
  world.camera.x = x;
  world.camera.y = y;
}

function spawnChasers(world, count) {
  const player = world.player;
  for (let i = 0; i < count; i++) {
    const behind = i % 2 === 0 ? -1 : 1;
    const car = makeCar(
      player.x - Math.cos(player.angle) * (180 + i * 90) + behind * 60,
      player.y - Math.sin(player.angle) * (180 + i * 90),
      player.angle,
      { driver: 'cop', color: '#14213d', siren: true, cruise: 430 },
    );
    car.speed = 300;
    world.cars.push(car);
  }
}

// Stage the named scene and return how to play it forward: the screen to
// show, how many 1/60 s steps to run, and whether the autopilot drives.
export function stageShot(name, world) {
  const roadY = world.city.roadsH[3];
  if (name === 'street') {
    putPlayerInCar(world, 1250, roadY, 0);
    world.say('Downtown, midday. The city is yours — drive anywhere.');
    return { screen: 'playing', steps: 180, driving: true };
  }
  if (name === 'chase') {
    putPlayerInCar(world, 1250, roadY, 0);
    world.missions.start(3); // Heat Wave: three stars, patrol cars inbound.
    spawnChasers(world, 4);
    world.flash('3 STARS — LOSE THE HEAT', '#ff5964');
    return { screen: 'playing', steps: 150, driving: true };
  }
  if (name === 'mission') {
    world.missions.start(2); // Collect the Debt: four armed thugs at the warehouse.
    const at = world.city.landmarks.warehouse;
    world.debug.teleport(at.x - 260, at.y + 40);
    world.player.aimAngle = 0;
    world.say('Marisol Vega: The Dockside crew owes twelve hundred. Collect it.');
    return { screen: 'playing', steps: 90, driving: false };
  }
  // 'start' and anything else: the title screen over a living city.
  return { screen: 'title', steps: 150, driving: false };
}
