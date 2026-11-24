// Vehicles: the car models, arcade driving physics, and the traffic that fills the roads.
// A car is a rectangle with a heading and a forward speed; steering only bites while it
// moves, and hard turns at speed slide a little. Traffic cars follow the road grid's lanes
// and turn at intersections; the player's car and police cars are steered, not scripted.

import { CAR_TYPES, ROADS, SHORE, TRAFFIC, WORLD } from './config.js';
import { resolveSolidCollision } from './city.js';

const HALF_ROAD = ROADS.width / 2;

export function createCar(typeId, x, y, angle, color, driver) {
  const type = CAR_TYPES[typeId];
  return {
    typeId,
    type,
    x, y,
    angle,
    speed: 0,
    steer: 0,
    color: color ?? type.colors[Math.floor(Math.random() * type.colors.length)],
    health: type.health,
    maxHealth: type.health,
    driver, // 'player' | 'traffic' | 'police' | 'parked' | 'none'
    radius: Math.max(type.length, type.width) / 2,
    // Traffic lane state: which road the car follows and which way it goes.
    lane: null,
    cruise: TRAFFIC.cruiseMin + Math.random() * (TRAFFIC.cruiseMax - TRAFFIC.cruiseMin),
    brake: 0,
    honk: 0,
    smoke: 0,
    dead: false,
    burnTimer: 0,
    id: 0,
  };
}

/** The lane offset for right-hand traffic on a road of the given axis and direction. */
function laneOffset(axis, dir) {
  if (axis === 'x') return dir > 0 ? HALF_ROAD - 28 : -(HALF_ROAD - 28);
  return dir > 0 ? -(HALF_ROAD - 28) : HALF_ROAD - 28;
}

/** Give a traffic car a lane: the nearest road, a random direction along it. */
export function assignLane(car, random) {
  let best = null;
  let bestDist = Infinity;
  for (const cx of ROADS.vertical) {
    const d = Math.abs(car.x - cx);
    if (d < bestDist) { bestDist = d; best = { axis: 'y', coord: cx }; }
  }
  for (const cy of ROADS.horizontal) {
    const d = Math.abs(car.y - cy);
    if (d < bestDist) { bestDist = d; best = { axis: 'x', coord: cy }; }
  }
  const dir = random() < 0.5 ? 1 : -1;
  car.lane = { axis: best.axis, coord: best.coord, dir };
  car.angle = best.axis === 'x' ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2);
  if (best.axis === 'x') car.y = best.coord + laneOffset('x', dir);
  else car.x = best.coord + laneOffset('y', dir);
}

/** One step of arcade car physics. throttle is -1..1, steer is -1..1. */
export function driveCar(car, throttle, steer, dt, city, handbrake) {
  const type = car.type;
  const forward = car.speed >= 0 ? 1 : -1;
  car.steer += ((steer - car.steer) * Math.min(1, dt * 10));
  const speedFactor = Math.min(1, Math.abs(car.speed) / 120);
  car.angle += car.steer * type.turn * speedFactor * forward * dt * (handbrake ? 1.6 : 1);

  const accel = throttle >= 0 ? type.accel * throttle : type.accel * 0.7 * throttle;
  car.speed += accel * dt;
  // Drag and rolling resistance, stronger off-road and with the handbrake.
  const offRoad = !isOnRoadPoint(car.x, car.y);
  let drag = 0.35 + (offRoad ? 0.9 : 0) + (handbrake ? 1.6 : 0);
  car.speed -= car.speed * drag * dt;
  const top = type.topSpeed * (offRoad ? 0.55 : 1);
  if (car.speed > top) car.speed = top;
  if (car.speed < -top * 0.4) car.speed = -top * 0.4;
  if (Math.abs(car.speed) < 4 && throttle === 0) car.speed = 0;

  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  const beforeX = car.x;
  const beforeY = car.y;
  car.x = Math.max(30, Math.min(WORLD.width - 30, nx));
  car.y = Math.max(30, Math.min(SHORE.sandTop - 10, ny));
  const hitWall = car.x !== nx || car.y !== ny;
  const hitBuilding = resolveSolidCollision(city, car);
  if (hitWall || hitBuilding) {
    const impact = Math.abs(car.speed);
    if (impact > 140) damageCar(car, (impact - 140) * 0.12);
    car.speed *= -0.25;
    car.x = beforeX + (car.x - beforeX) * 0.4;
    car.y = beforeY + (car.y - beforeY) * 0.4;
    return impact > 140;
  }
  return false;
}

function isOnRoadPoint(x, y) {
  for (const cx of ROADS.vertical) if (Math.abs(x - cx) <= HALF_ROAD) return true;
  for (const cy of ROADS.horizontal) if (Math.abs(y - cy) <= HALF_ROAD) return true;
  return false;
}

export function damageCar(car, amount) {
  if (car.dead) return;
  car.health -= amount;
  car.smoke = car.health < car.maxHealth * 0.45 ? 1 : car.smoke;
  if (car.health <= 0) {
    car.health = 0;
    car.dead = true;
    car.burnTimer = 3;
  }
}

/** Simple circle push-apart between two cars; returns the impact speed for damage/sound. */
export function collideCars(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy);
  const min = (a.radius + b.radius) * 0.82;
  if (dist >= min || dist < 0.001) return 0;
  const nx = dx / dist;
  const ny = dy / dist;
  const overlap = (min - dist) / 2;
  a.x -= nx * overlap;
  a.y -= ny * overlap;
  b.x += nx * overlap;
  b.y += ny * overlap;
  const relSpeed = Math.abs(a.speed - b.speed) + Math.abs(a.speed) * 0.2 + Math.abs(b.speed) * 0.2;
  const push = Math.min(60, relSpeed * 0.25);
  a.speed -= push * 0.5;
  b.speed += push * 0.5;
  return relSpeed;
}

/** Is there a car ahead of `car` within `gap` along its heading? */
function carAhead(car, cars, gap) {
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  for (const other of cars) {
    if (other === car || other.dead) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const ahead = dx * fx + dy * fy;
    if (ahead < 0 || ahead > gap) continue;
    const side = Math.abs(-dx * fy + dy * fx);
    if (side < 30) return other;
  }
  return null;
}

/**
 * Traffic AI: follow the lane, brake for the car ahead, and at intersections sometimes
 * turn onto the crossing road. Returns true when the car braked hard (for the horn).
 */
export function updateTrafficCar(car, dt, city, cars, random) {
  if (!car.lane) assignLane(car, random);
  const lane = car.lane;
  const axis = lane.axis;
  const coord = lane.coord;
  const dir = lane.dir;
  // Target point a little ahead on the lane, so the car steers onto it smoothly.
  const target = { x: car.x, y: car.y };
  const look = 90;
  if (axis === 'x') {
    target.x = car.x + dir * look;
    target.y = coord + laneOffset('x', dir);
  } else {
    target.y = car.y + dir * look;
    target.x = coord + laneOffset('y', dir);
  }
  // At an intersection, maybe turn onto the crossing road.
  const crossings = axis === 'x' ? ROADS.vertical : ROADS.horizontal;
  const pos = axis === 'x' ? car.x : car.y;
  for (const c of crossings) {
    if (Math.abs(pos - c) < 14 && random() < TRAFFIC.turnChance * dt * 12) {
      const newDir = random() < 0.5 ? 1 : -1;
      const newAxis = axis === 'x' ? 'y' : 'x';
      car.lane = { axis: newAxis, coord: c, dir: newDir };
      break;
    }
  }
  // Near the map edge, turn around instead of leaving town.
  const edge = axis === 'x' ? (dir > 0 ? WORLD.width - 90 : 90) : (dir > 0 ? SHORE.sandTop - 90 : 90);
  if ((dir > 0 && pos > edge) || (dir < 0 && pos < edge)) {
    lane.dir = -dir;
    car.angle += Math.PI;
  }
  const desired = Math.atan2(target.y - car.y, target.x - car.x);
  let diff = desired - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const steer = Math.max(-1, Math.min(1, diff * 2.2));
  const ahead = carAhead(car, cars, TRAFFIC.brakeGap);
  let throttle = 0.55;
  if (ahead) {
    const gap = Math.hypot(ahead.x - car.x, ahead.y - car.y);
    throttle = gap < 55 ? -0.9 : 0.12;
    if (gap < 45 && car.honk <= 0) car.honk = 0.8;
  }
  if (car.speed > car.cruise) throttle = Math.min(throttle, 0);
  if (car.honk > 0) car.honk -= dt;
  return driveCar(car, throttle, steer, dt, city, false);
}
