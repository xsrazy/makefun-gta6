// Pedestrians: the people of Solmar Bay. They stroll the sidewalks between random
// waypoints, pause at crossings, and run when shots ring out or a car bears down on
// them. A pedestrian knocked down by a car stays down for a while, then gets up and
// limps away — the city keeps living around the player's crimes.

import { PEDESTRIANS, SHORE, WORLD } from './config.js';
import { randomSidewalkPoint, resolveSolidCollision } from './city.js';

const SHIRTS = ['#e85d75', '#5d8fe8', '#e8b45d', '#5dbb7a', '#9b5de8', '#e8e8e8', '#5dc9e8', '#e86a5d'];
const PANTS = ['#2e3a4a', '#4a3a2e', '#3a4a5e', '#5e5e5e', '#2e4a3a'];
const SKINS = ['#f2c9a0', '#d8a06a', '#a06a3a', '#8a5a2e', '#e8b88a'];

export function createPed(x, y, random) {
  return {
    x, y,
    angle: random() * Math.PI * 2,
    speed: 0,
    walkSpeed: PEDESTRIANS.walkMin + random() * (PEDESTRIANS.walkMax - PEDESTRIANS.walkMin),
    state: 'walk', // 'walk' | 'flee' | 'down' | 'idle'
    target: null,
    stateTimer: 0,
    shirt: SHIRTS[Math.floor(random() * SHIRTS.length)],
    pants: PANTS[Math.floor(random() * PANTS.length)],
    skin: SKINS[Math.floor(random() * SKINS.length)],
    radius: 11,
    stepPhase: random() * Math.PI * 2,
    fleeFrom: null,
    armed: false,
    health: 100,
  };
}

export function spawnPeds(count, random) {
  const peds = [];
  for (let i = 0; i < count; i += 1) {
    const p = randomSidewalkPoint(random);
    const ped = createPed(p.x, p.y, random);
    ped.target = randomSidewalkPoint(random);
    peds.push(ped);
  }
  return peds;
}

/** Make every pedestrian near (x, y) run away from it. */
export function scarePeds(peds, x, y, radius) {
  for (const ped of peds) {
    if (ped.state === 'down') continue;
    const d = Math.hypot(ped.x - x, ped.y - y);
    if (d < radius) {
      ped.state = 'flee';
      ped.fleeFrom = { x, y };
      ped.stateTimer = 2.5 + Math.random() * 2;
    }
  }
}

function pickNewTarget(ped, random) {
  ped.target = randomSidewalkPoint(random);
}

function walkToward(ped, tx, ty, speed, dt) {
  const dx = tx - ped.x;
  const dy = ty - ped.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 4) return true;
  const want = Math.atan2(dy, dx);
  let diff = want - ped.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  ped.angle += Math.max(-3.2 * dt, Math.min(3.2 * dt, diff));
  ped.speed = speed;
  ped.x += Math.cos(ped.angle) * speed * dt;
  ped.y += Math.sin(ped.angle) * speed * dt;
  ped.stepPhase += dt * speed * 0.09;
  return false;
}

/**
 * One step for every pedestrian. `threats` is a list of {x, y, radius} to run from
 * (gunfire, a speeding car). Peds avoid buildings and the sea.
 */
export function updatePeds(peds, dt, city, random, threats) {
  for (const ped of peds) {
    if (ped.state === 'down') {
      ped.stateTimer -= dt;
      ped.speed = 0;
      if (ped.stateTimer <= 0) {
        ped.state = 'flee';
        ped.stateTimer = 2;
        ped.fleeFrom = { x: ped.x + (random() - 0.5) * 200, y: ped.y + (random() - 0.5) * 200 };
      }
      continue;
    }
    if (ped.state !== 'flee') {
      for (const t of threats) {
        if (Math.hypot(ped.x - t.x, ped.y - t.y) < t.radius) {
          ped.state = 'flee';
          ped.fleeFrom = { x: t.x, y: t.y };
          ped.stateTimer = 3;
          break;
        }
      }
    }
    if (ped.state === 'flee') {
      ped.stateTimer -= dt;
      const away = Math.atan2(ped.y - ped.fleeFrom.y, ped.x - ped.fleeFrom.x);
      const tx = ped.x + Math.cos(away) * 120;
      const ty = ped.y + Math.sin(away) * 120;
      walkToward(ped, tx, ty, PEDESTRIANS.fleeSpeed, dt);
      if (ped.stateTimer <= 0) {
        ped.state = 'walk';
        pickNewTarget(ped, random);
      }
    } else if (ped.state === 'idle') {
      ped.stateTimer -= dt;
      ped.speed = 0;
      if (ped.stateTimer <= 0) {
        ped.state = 'walk';
        pickNewTarget(ped, random);
      }
    } else {
      if (!ped.target || walkToward(ped, ped.target.x, ped.target.y, ped.walkSpeed, dt)) {
        if (random() < 0.25) {
          ped.state = 'idle';
          ped.stateTimer = 1 + random() * 3;
        } else {
          pickNewTarget(ped, random);
        }
      }
    }
    ped.x = Math.max(16, Math.min(WORLD.width - 16, ped.x));
    ped.y = Math.max(16, Math.min(SHORE.sandTop - 6, ped.y));
    resolveSolidCollision(city, ped);
  }
}

/** Knock a pedestrian down (hit by a car or a punch). Returns true if it was standing. */
export function knockDownPed(ped, seconds) {
  if (ped.state === 'down') return false;
  ped.state = 'down';
  ped.stateTimer = seconds;
  ped.speed = 0;
  return true;
}
