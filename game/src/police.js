// Neon Harbor — the wanted system and the Harbor PD. Crimes add heat; heat
// sets the star level; stars decide how many patrol cars chase the player.
// Lose the cops' line of sight and the heat bleeds away.

import { POLICE } from './config.js';
import { makeCar } from './vehicles.js';
import { spawnFootCop } from './pedestrians.js';

export function wantedStars(world) {
  return Math.min(POLICE.maxStars, Math.floor(world.heat / POLICE.heatPerStar));
}

export function addHeat(world, amount, reason) {
  const before = wantedStars(world);
  world.heat = Math.min(POLICE.maxStars * POLICE.heatPerStar, world.heat + amount);
  const after = wantedStars(world);
  if (after > before) {
    world.flash(`${after} STAR${after > 1 ? 'S' : ''} — ${reason.toUpperCase()}`, '#ff5964');
    world.audio.setSiren(true);
  }
  world.lastCrimeAt = world.time;
}

export function setWanted(world, stars) {
  world.heat = Math.min(POLICE.maxStars, stars) * POLICE.heatPerStar;
  world.lastCrimeAt = world.time; // fresh heat, so it does not decay at once
  if (stars > 0) world.audio.setSiren(true);
}

function copCars(world) {
  return world.cars.filter((c) => c.driver === 'cop' && !c.dead);
}

function footCops(world) {
  return world.peds.filter((p) => p.cop && p.state !== 'dead');
}

function spawnCopCar(world) {
  const player = world.player;
  // Spawn on a road 650-950 px from the player, roughly in front of them.
  for (let tries = 0; tries < 12; tries++) {
    const p = world.city.randomRoadPoint(world.rng);
    const d = Math.hypot(p.x - player.x, p.y - player.y);
    if (d > 650 && d < 1000) {
      const car = makeCar(p.x, p.y, Math.atan2(player.y - p.y, player.x - p.x), {
        driver: 'cop', color: '#14213d', siren: true, cruise: 430,
      });
      car.speed = 200;
      world.cars.push(car);
      return car;
    }
  }
  return null;
}

function chasePlayer(car, dt, world) {
  const player = world.player;
  const dx = player.x - car.x;
  const dy = player.y - car.y;
  const dist = Math.hypot(dx, dy);
  const want = Math.atan2(dy, dx);
  let diff = want - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  car.angle += Math.max(-3.4 * dt, Math.min(3.4 * dt, diff));
  const targetSpeed = dist > 90 ? 470 : 240;
  car.speed += (targetSpeed - car.speed) * Math.min(1, dt * 1.8);
  const moved = world.city.moveCircle(car.x, car.y, Math.cos(car.angle) * car.speed * dt, Math.sin(car.angle) * car.speed * dt, 18);
  if (moved.blocked) {
    car.angle += Math.PI / 3;
    car.speed *= 0.5;
  }
  car.x = moved.x;
  car.y = moved.y;

  // Ramming the player's car damages it; ramming the player hurts them.
  if (dist < 42) {
    if (player.onFoot) {
      world.damagePlayer(14 * dt * 4, 'rammed');
    } else if (player.car) {
      player.car.hp -= 26 * dt;
      car.hp -= 8 * dt;
      if (Math.random() < dt * 4) world.onCrash(car.x, car.y, 200);
      if (player.car.hp <= 0 && !player.car.dead) {
        player.car.dead = true;
        player.car.speed = 0;
        player.car.smoke = 1;
        world.onCarDestroyed(player.car);
      }
    }
  }
  // At 3 stars and up, patrol cars shoot from the window.
  if (wantedStars(world) >= 3 && dist < 420 && dist > 60) {
    car.shootTimer = (car.shootTimer ?? 0.5) - dt;
    if (car.shootTimer <= 0) {
      car.shootTimer = 0.85;
      const spread = (Math.random() - 0.5) * 0.3;
      world.fireBullet(car.x, car.y, Math.atan2(dy, dx) + spread, { from: 'cop', damage: 9 });
    }
  }
  // A cop that catches the player on foot sends an officer out to grab them.
  if (player.onFoot && dist < 130 && footCops(world).length < POLICE.maxFootCops && !car.deployed) {
    car.deployed = true;
    spawnFootCop(world, car.x + 24, car.y);
  }
}

export function updatePolice(world, dt) {
  const stars = wantedStars(world);
  const player = world.player;

  // Heat decays only while no officer can see the player.
  const seen = [...copCars(world), ...footCops(world)].some((unit) => {
    const d = Math.hypot(unit.x - player.x, unit.y - player.y);
    return d < POLICE.sightRange;
  });
  if (!seen && stars > 0 && world.time - world.lastCrimeAt > 4) {
    const before = stars;
    world.heat = Math.max(0, world.heat - POLICE.decayPerSec * dt);
    if (wantedStars(world) < before && wantedStars(world) === 0) {
      world.flash('YOU LOST THEM', '#4ecdc4');
      world.audio.setSiren(false);
    }
  }

  // Keep the pursuit at strength: two patrol cars per star.
  world.spawnTimer = (world.spawnTimer ?? 0) - dt;
  if (stars > 0 && copCars(world).length < Math.min(POLICE.maxCopCars, stars * 2) && world.spawnTimer <= 0) {
    world.spawnTimer = 1.6;
    spawnCopCar(world);
  }

  for (const car of copCars(world)) {
    if (stars === 0) {
      car.driver = 'leaving';
      continue;
    }
    chasePlayer(car, dt, world);
    if (car.hp <= 0 && !car.dead) {
      car.dead = true;
      car.speed = 0;
      car.smoke = 1;
      world.burst(car.x, car.y, '#ff9f1c', 18, 220);
      world.audio.crash();
    }
  }

  // Foot cops grab the player: held still for bustTime, the run is over.
  if (player.onFoot && stars > 0) {
    const grabber = footCops(world).find((cop) => Math.hypot(cop.x - player.x, cop.y - player.y) < 20);
    if (grabber) {
      world.bustTimer = (world.bustTimer ?? 0) + dt;
      player.x = grabber.x;
      player.y = grabber.y;
      if (world.bustTimer > POLICE.bustTime) {
        world.endState = 'busted';
      }
    } else {
      world.bustTimer = 0;
    }
  } else {
    world.bustTimer = 0;
  }

  // Officers with no heat left walk off the job.
  if (stars === 0) {
    for (const cop of footCops(world)) {
      cop.state = 'walk';
      cop.hostile = false;
      cop.cop = false;
    }
  }
}
