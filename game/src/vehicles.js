// Neon Harbor — cars: traffic that follows the road network, parked cars to
// steal, and the player's driving physics. A car is a rectangle with a
// heading and a speed; traffic steers by road, the player steers by input.

import { CAR, PALETTE, ROAD_W, TRAFFIC } from './config.js';

let nextId = 1;

export function makeCar(x, y, angle, opts = {}) {
  return {
    id: nextId++,
    x, y, angle,
    speed: 0,
    w: 46, h: 22,
    color: opts.color || '#e63946',
    driver: opts.driver || 'parked', // parked | traffic | player | cop | leaving
    road: opts.road || null, // { dir: 'v'|'h', at: centreline } for traffic
    roadDir: opts.roadDir || 1,
    lane: opts.lane || 1,
    cruise: opts.cruise || 150,
    hp: 100,
    dead: false,
    brake: false,
    siren: opts.siren || false,
    turnCooldown: 0,
    smoke: 0,
  };
}

export function spawnTraffic(city, rng) {
  const cars = [];
  for (let i = 0; i < TRAFFIC.count; i++) {
    const p = city.randomRoadPoint(rng);
    const road = city.roadAt(p.x, p.y);
    if (!road) continue;
    const dir = rng.chance(0.5) ? 1 : -1;
    const lane = rng.chance(0.5) ? 1 : -1;
    const angle = road.dir === 'v' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
    const offset = lane * (ROAD_W / 4);
    const car = makeCar(
      road.dir === 'v' ? road.at + offset : p.x,
      road.dir === 'h' ? road.at + offset : p.y,
      angle,
      { driver: 'traffic', color: rng.pick(PALETTE.car), road, roadDir: dir, lane, cruise: rng.range(TRAFFIC.speedMin, TRAFFIC.speedMax) },
    );
    car.speed = car.cruise;
    cars.push(car);
  }
  return cars;
}

export function spawnParked(city, rng) {
  const cars = [];
  for (let i = 0; i < TRAFFIC.parked; i++) {
    const p = city.randomRoadPoint(rng);
    const road = city.roadAt(p.x, p.y);
    if (!road) continue;
    const side = rng.chance(0.5) ? 1 : -1;
    const edge = ROAD_W / 2 - 14;
    const angle = road.dir === 'v' ? (rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2) : (rng.chance(0.5) ? 0 : Math.PI);
    cars.push(makeCar(
      road.dir === 'v' ? road.at + side * edge : p.x,
      road.dir === 'h' ? road.at + side * edge : p.y,
      angle,
      { driver: 'parked', color: rng.pick(PALETTE.car) },
    ));
  }
  return cars;
}

export function nearestCar(cars, x, y, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const car of cars) {
    if (car.dead) continue;
    const d = Math.hypot(car.x - x, car.y - y);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

// Is another car directly ahead of `car` on its road, close enough to brake for?
function carAhead(cars, car) {
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  for (const other of cars) {
    if (other === car || other.dead) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const ahead = dx * fx + dy * fy;
    if (ahead > 0 && ahead < 70 && Math.abs(-dx * fy + dy * fx) < 26) return true;
  }
  return false;
}

function updateTrafficCar(car, dt, city, cars, rng) {
  if (car.dead || !car.road) return;
  car.turnCooldown -= dt;
  const blocked = carAhead(cars, car);
  car.brake = blocked;
  const target = blocked ? 0 : car.cruise;
  car.speed += (target - car.speed) * Math.min(1, dt * 2.5);

  // At an intersection, sometimes turn onto the crossing road.
  const crossing = car.road.dir === 'v' ? city.roadsH : city.roadsV;
  const pos = car.road.dir === 'v' ? car.y : car.x;
  const nearCross = crossing.find((c) => Math.abs(pos - c) < 26);
  if (nearCross !== undefined && car.turnCooldown <= 0 && rng.chance(0.3)) {
    const newDir = rng.chance(0.5) ? 1 : -1;
    car.road = { dir: car.road.dir === 'v' ? 'h' : 'v', at: nearCross };
    car.roadDir = newDir;
    car.turnCooldown = 2;
  }

  const targetAngle = car.road.dir === 'v'
    ? (car.roadDir > 0 ? Math.PI / 2 : -Math.PI / 2)
    : (car.roadDir > 0 ? 0 : Math.PI);
  // Steer toward the target heading, and toward the lane centre.
  let diff = targetAngle - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  car.angle += Math.max(-2.2 * dt, Math.min(2.2 * dt, diff));
  const laneOffset = car.lane * (ROAD_W / 4);
  const lanePos = car.road.dir === 'v' ? car.road.at + laneOffset : car.road.at + laneOffset;
  if (car.road.dir === 'v') car.x += (lanePos - car.x) * Math.min(1, dt * 1.5);
  else car.y += (lanePos - car.y) * Math.min(1, dt * 1.5);

  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  const moved = city.moveCircle(nx, ny, 0, 0, 16);
  if (!city.hitsBuilding(nx, ny, 16)) {
    car.x = nx;
    car.y = ny;
  } else {
    car.speed = 0;
    car.angle += Math.PI / 2; // nudged out of a dead end
  }
  void moved;
}

// The player's car: arcade physics with speed-scaled steering, handbrake
// slides, building collisions and car-to-car bumps.
export function drivePlayerCar(car, dt, input, city, world) {
  const axes = input.axes();
  const forward = axes.y < 0;
  const back = axes.y > 0;
  const steer = axes.x;
  const handbrake = input.handbrake();

  if (forward) car.speed += CAR.accel * dt;
  else if (back) car.speed -= (car.speed > 0 ? CAR.brake : CAR.accel * 0.6) * dt;
  else car.speed -= car.speed * (handbrake ? 2.2 : 0.55) * dt;
  car.speed = Math.max(-CAR.reverseMax, Math.min(CAR.maxSpeed, car.speed));
  if (Math.abs(car.speed) < 2 && !forward && !back) car.speed = 0;

  const speedFactor = Math.min(1, Math.abs(car.speed) / 160);
  const grip = handbrake ? 0.45 : 1;
  car.angle += steer * CAR.turnRate * speedFactor * grip * dt * Math.sign(car.speed || 1);

  const vx = Math.cos(car.angle) * car.speed;
  const vy = Math.sin(car.angle) * car.speed;
  const moved = city.moveCircle(car.x, car.y, vx * dt, vy * dt, 18);
  if (moved.blocked && Math.abs(car.speed) > 120) {
    car.hp -= 12;
    world.onCrash(car.x, car.y, Math.abs(car.speed));
    car.speed *= -0.25;
  }
  car.x = moved.x;
  car.y = moved.y;

  // Bump other cars: shove them and trade a little speed.
  for (const other of world.cars) {
    if (other === car || other.dead) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const d = Math.hypot(dx, dy);
    if (d > 0 && d < 40) {
      const push = (40 - d) / 2;
      const ux = dx / d;
      const uy = dy / d;
      other.x += ux * push;
      other.y += uy * push;
      car.x -= ux * push * 0.5;
      car.y -= uy * push * 0.5;
      if (Math.abs(car.speed) > 140) {
        other.hp -= 15;
        car.hp -= 6;
        world.onCrash(other.x, other.y, Math.abs(car.speed));
        if (other.driver === 'traffic') other.driver = 'parked';
      }
      other.speed = car.speed * 0.4;
    }
  }
  if (car.hp <= 0 && !car.dead) {
    car.dead = true;
    car.speed = 0;
    car.smoke = 1;
    world.onCarDestroyed(car);
  }
}

export function updateCars(world, dt, rng) {
  for (const car of world.cars) {
    if (car.driver === 'traffic') updateTrafficCar(car, dt, world.city, world.cars, rng);
    else if (car.driver === 'leaving') {
      car.speed = Math.min(car.cruise, car.speed + 120 * dt);
      car.x += Math.cos(car.angle) * car.speed * dt;
      car.y += Math.sin(car.angle) * car.speed * dt;
    }
    if (car.dead && car.smoke > 0) car.smoke = Math.max(0, car.smoke - dt * 0.05);
  }
  // Respawn traffic that wandered off the map or was wrecked, so the streets stay alive.
  const alive = world.cars.filter((c) => c.driver === 'traffic' && !c.dead).length;
  if (alive < TRAFFIC.count - 6 && rng.chance(0.02)) {
    const fresh = spawnTraffic(world.city, rng);
    world.cars.push(...fresh.slice(0, 2));
  }
}
