// The law: the wanted system and the Solmar Bay police who enforce it. Heat rises with
// every crime the city sees and cools when no officer can see the player; the star count
// sets how many patrol cars hunt the player, how aggressive they are, and whether the
// officers on foot draw their pistols. Get caught standing still and it is over.

import { ROADS, SHORE, WANTED, WANTED_HEAT, WORLD } from './config.js';
import { createCar, driveCar } from './vehicles.js';

export function starsForHeat(heat) {
  let stars = 0;
  for (let i = 0; i < WANTED_HEAT.length; i += 1) if (heat >= WANTED_HEAT[i]) stars = i;
  return stars;
}

/** Add heat for a crime; returns the new star count. */
export function addHeat(state, amount) {
  state.heat = Math.min(400, state.heat + amount);
  state.lastCrimeAt = state.time;
  const stars = starsForHeat(state.heat);
  if (stars > state.wanted) state.wanted = stars;
  return stars;
}

/** Is any officer close enough to see the player right now? */
export function policeCanSeePlayer(state) {
  const p = state.player;
  for (const car of state.cars) {
    if (car.driver !== 'police' || car.dead) continue;
    if (Math.hypot(car.x - p.x, car.y - p.y) < WANTED.sightRadius) return true;
  }
  for (const cop of state.footCops) {
    if (Math.hypot(cop.x - p.x, cop.y - p.y) < WANTED.sightRadius) return true;
  }
  return false;
}

/** Cool the heat down when the player has been out of sight for a while. */
export function updateWanted(state, dt) {
  if (state.wanted === 0) {
    state.heat = 0;
    return;
  }
  if (state.time - state.lastCrimeAt < WANTED.graceAfterCrime) return;
  if (policeCanSeePlayer(state)) return;
  state.heat = Math.max(0, state.heat - WANTED.decayPerSecond * dt);
  const stars = starsForHeat(state.heat);
  if (stars < state.wanted) state.wanted = stars;
}

/** A spawn point for a patrol car: on a road near the player, but off the screen. */
function policeSpawnPoint(state, random) {
  const p = state.player;
  for (let tries = 0; tries < 12; tries += 1) {
    const vertical = random() < 0.5;
    let x;
    let y;
    if (vertical) {
      x = ROADS.vertical[Math.floor(random() * ROADS.vertical.length)];
      y = p.y + (random() < 0.5 ? -1 : 1) * (520 + random() * 500);
    } else {
      y = ROADS.horizontal[Math.floor(random() * ROADS.horizontal.length)];
      x = p.x + (random() < 0.5 ? -1 : 1) * (520 + random() * 500);
    }
    x = Math.max(60, Math.min(WORLD.width - 60, x));
    y = Math.max(60, Math.min(SHORE.sandTop - 60, y));
    const d = Math.hypot(x - p.x, p.y - y);
    if (d > 520 && d < 1100) return { x, y };
  }
  return { x: Math.max(60, Math.min(WORLD.width - 60, p.x + 700)), y: Math.max(60, Math.min(SHORE.sandTop - 60, p.y)) };
}

function countPoliceCars(state) {
  let n = 0;
  for (const car of state.cars) if (car.driver === 'police' && !car.dead) n += 1;
  return n;
}

/** Keep the patrol strength matched to the wanted level. */
export function maintainPolice(state, random) {
  const wanted = state.wanted;
  const target = WANTED.copCarsPerStar[wanted];
  let have = countPoliceCars(state);
  if (have < target) {
    const point = policeSpawnPoint(state, random);
    const car = createCar('cruiser', point.x, point.y, 0, '#101418', 'police');
    car.id = state.nextCarId++;
    state.cars.push(car);
    have += 1;
  }
  // When the heat is gone, patrol cars give up and drive off (they despawn far away).
  if (wanted === 0) {
    for (const car of state.cars) {
      if (car.driver !== 'police') continue;
      const d = Math.hypot(car.x - state.player.x, car.y - state.player.y);
      if (d > 900) car.remove = true;
    }
  }
}

/** Steer a patrol car at the player and ram; returns true on a hard impact. */
export function updatePoliceCar(car, state, dt) {
  const p = state.player;
  const target = p.car ?? p;
  const predict = 0.35;
  const tx = target.x + (target.vx ?? 0) * predict;
  const ty = target.y + (target.vy ?? 0) * predict;
  const desired = Math.atan2(ty - car.y, tx - car.x);
  let diff = desired - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const steer = Math.max(-1, Math.min(1, diff * 2.4));
  const dist = Math.hypot(target.x - car.x, target.y - car.y);
  let throttle = 1;
  if (dist < 60) throttle = 0.7;
  if (Math.abs(diff) > 1.2 && car.speed > 200) throttle = 0.2;
  const crashed = driveCar(car, throttle, steer, dt, state.city, false);
  car.sirenFlash = (state.time * 6 + car.id) % 2 < 1;
  return crashed;
}

export function createFootCop(x, y) {
  return {
    x, y,
    angle: 0,
    speed: 0,
    radius: 11,
    health: 100,
    shootTimer: 1,
    arrestTimer: 0,
    shirt: '#2e4a6b',
    pants: '#1c2733',
    skin: '#d8a06a',
    stepPhase: 0,
    state: 'chase',
    stateTimer: 0,
  };
}

/**
 * Foot officers chase the player on foot. At three stars and up they shoot; standing
 * still next to one for a moment gets the player arrested. Returns 'busted' or null.
 */
export function updateFootCops(state, dt, random) {
  const p = state.player;
  const playerSpeed = Math.hypot(p.vx ?? 0, p.vy ?? 0);
  for (const cop of state.footCops) {
    const dx = p.x - cop.x;
    const dy = p.y - cop.y;
    const dist = Math.hypot(dx, dy);
    cop.angle = Math.atan2(dy, dx);
    if (p.car) {
      // The player drove off: the officer runs back toward the road and gives up.
      cop.x += Math.cos(cop.angle) * 200 * dt;
      cop.y += Math.sin(cop.angle) * 200 * dt;
      if (dist > 700) cop.remove = true;
      continue;
    }
    const speed = state.wanted >= 4 ? 250 : 225;
    cop.x += Math.cos(cop.angle) * speed * dt;
    cop.y += Math.sin(cop.angle) * speed * dt;
    cop.stepPhase += dt * speed * 0.09;
    if (dist < 30 && playerSpeed < 120) {
      cop.arrestTimer += dt;
      if (cop.arrestTimer >= WANTED.arrestSeconds) return 'busted';
    } else {
      cop.arrestTimer = Math.max(0, cop.arrestTimer - dt);
    }
    if (state.wanted >= 3 && dist < 420 && dist > 60) {
      cop.shootTimer -= dt;
      if (cop.shootTimer <= 0) {
        cop.shootTimer = 0.9 + random() * 0.7;
        cop.wantsShot = { angle: cop.angle + (random() - 0.5) * 0.35 };
      }
    }
  }
  state.footCops = state.footCops.filter((c) => !c.remove);
  return null;
}

/** When a patrol car pulls up beside a player on foot, an officer steps out. */
export function maybeDeployFootCop(state, random) {
  if (state.player.car) return;
  if (state.footCops.length >= WANTED.maxFootCops) return;
  if (state.wanted === 0) return;
  for (const car of state.cars) {
    if (car.driver !== 'police' || car.dead) continue;
    const d = Math.hypot(car.x - state.player.x, car.y - state.player.y);
    if (d < 130 && Math.abs(car.speed) < 90 && random() < 0.02) {
      state.footCops.push(createFootCop(car.x + 30, car.y + 10));
      return;
    }
  }
}

/** The nearest patrol car, for the siren and the minimap. */
export function nearestPoliceDistance(state) {
  let best = Infinity;
  for (const car of state.cars) {
    if (car.driver !== 'police' || car.dead) continue;
    best = Math.min(best, Math.hypot(car.x - state.player.x, car.y - state.player.y));
  }
  return best;
}
