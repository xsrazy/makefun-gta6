// Neon Harbor — pedestrians: sidewalk walkers who flee from gunfire, plus
// the armed thugs and foot cops the missions and the police spawn. A ped is
// a dot with a heading; hostile ones chase and shoot at the player.

import { COMBAT, PEDS, ROAD_W } from './config.js';

export function makePed(x, y, opts = {}) {
  return {
    x, y,
    angle: opts.angle ?? 0,
    speed: opts.speed ?? 60,
    color: opts.color || '#ff6b6b',
    state: 'walk', // walk | flee | down | dead
    road: opts.road || null,
    roadDir: opts.roadDir || 1,
    lane: opts.lane || 1,
    downTimer: 0,
    hostile: opts.hostile || false,
    cop: opts.cop || false,
    hp: opts.hp ?? 100,
    shootTimer: 0,
    fleeX: 0,
    fleeY: 0,
  };
}

export function spawnPeds(city, rng) {
  const peds = [];
  for (let i = 0; i < PEDS.count; i++) {
    const p = city.randomRoadPoint(rng);
    const road = city.roadAt(p.x, p.y);
    if (!road) continue;
    const side = rng.chance(0.5) ? 1 : -1;
    const edge = ROAD_W / 2 + 12;
    peds.push(makePed(
      road.dir === 'v' ? road.at + side * edge : p.x,
      road.dir === 'h' ? road.at + side * edge : p.y,
      {
        color: rng.pick(['#ff6b6b', '#4ecdc4', '#ffe66d', '#95d5b2', '#b8c0ff', '#ffafcc', '#a3b18a', '#fca311']),
        speed: rng.range(PEDS.walkMin, PEDS.walkMax),
        road, roadDir: rng.chance(0.5) ? 1 : -1, lane: side,
      },
    ));
  }
  return peds;
}

export function spawnThug(world, x, y) {
  const ped = makePed(x, y, { hostile: true, hp: 100, speed: 150, color: '#3a0ca3' });
  world.peds.push(ped);
  return ped;
}

export function spawnFootCop(world, x, y) {
  const ped = makePed(x, y, { cop: true, hostile: true, hp: 100, speed: 235, color: '#1d3557' });
  world.peds.push(ped);
  return ped;
}

export function scarePeds(world, x, y, radius) {
  for (const ped of world.peds) {
    if (ped.hostile || ped.state === 'dead' || ped.state === 'down') continue;
    const d = Math.hypot(ped.x - x, ped.y - y);
    if (d < radius) {
      ped.state = 'flee';
      ped.fleeX = ped.x - x;
      ped.fleeY = ped.y - y;
      const len = Math.hypot(ped.fleeX, ped.fleeY) || 1;
      ped.fleeX /= len;
      ped.fleeY /= len;
    }
  }
}

export function damagePed(world, ped, amount, byPlayer) {
  if (ped.state === 'dead') return;
  ped.hp -= amount;
  if (ped.hp > 0) {
    if (!ped.hostile) {
      ped.state = 'flee';
      ped.fleeX = ped.x - world.player.x;
      ped.fleeY = ped.y - world.player.y;
      const len = Math.hypot(ped.fleeX, ped.fleeY) || 1;
      ped.fleeX /= len;
      ped.fleeY /= len;
    }
    return;
  }
  ped.state = 'dead';
  ped.hp = 0;
  world.burst(ped.x, ped.y, '#c1121f', 14, 160);
  if (byPlayer) {
    world.stats.kills += 1;
    if (ped.hostile) {
      world.missions.registerKill(ped);
    } else {
      world.addHeat(25, 'civilian down');
    }
  }
}

function updateWalker(ped, dt, city) {
  if (!ped.road) return;
  const targetAngle = ped.road.dir === 'v'
    ? (ped.roadDir > 0 ? Math.PI / 2 : -Math.PI / 2)
    : (ped.roadDir > 0 ? 0 : Math.PI);
  ped.angle = targetAngle;
  const nx = ped.x + Math.cos(ped.angle) * ped.speed * dt;
  const ny = ped.y + Math.sin(ped.angle) * ped.speed * dt;
  const moved = city.moveCircle(ped.x, ped.y, nx - ped.x, ny - ped.y, 9);
  ped.x = moved.x;
  ped.y = moved.y;
  // Turn around at the map's edge or when blocked.
  if (moved.blocked || ped.x < 30 || ped.x > 3170 || ped.y < 30 || ped.y > 2370) {
    ped.roadDir *= -1;
  }
}

function updateHostile(ped, dt, world) {
  const player = world.player;
  const dx = player.x - ped.x;
  const dy = player.y - ped.y;
  const dist = Math.hypot(dx, dy);
  ped.angle = Math.atan2(dy, dx);
  if (ped.cop) {
    // Foot cops run the player down and grab them.
    if (dist > 16) {
      const moved = world.city.moveCircle(ped.x, ped.y, (dx / (dist || 1)) * ped.speed * dt, (dy / (dist || 1)) * ped.speed * dt, 9);
      ped.x = moved.x;
      ped.y = moved.y;
    }
    return;
  }
  // Thugs close to firing range, then stand and shoot.
  if (dist > COMBAT.thugRange * 0.75) {
    const moved = world.city.moveCircle(ped.x, ped.y, (dx / (dist || 1)) * ped.speed * dt, (dy / (dist || 1)) * ped.speed * dt, 9);
    ped.x = moved.x;
    ped.y = moved.y;
  } else if (dist < COMBAT.thugRange) {
    ped.shootTimer -= dt;
    if (ped.shootTimer <= 0) {
      ped.shootTimer = 0.9 + Math.random() * 0.7;
      const spread = (Math.random() - 0.5) * 0.35;
      world.fireBullet(ped.x, ped.y, ped.angle + spread, { from: 'thug', damage: COMBAT.thugDamage });
    }
  }
}

export function updatePeds(world, dt) {
  const player = world.player;
  for (const ped of world.peds) {
    if (ped.state === 'dead') continue;
    if (ped.state === 'down') {
      ped.downTimer -= dt;
      if (ped.downTimer <= 0) {
        ped.state = ped.hostile ? 'walk' : 'flee';
        ped.hp = Math.max(ped.hp, 30);
      }
      continue;
    }
    if (ped.hostile) {
      updateHostile(ped, dt, world);
      continue;
    }
    if (ped.state === 'flee') {
      const moved = world.city.moveCircle(ped.x, ped.y, ped.fleeX * PEDS.fleeSpeed * dt, ped.fleeY * PEDS.fleeSpeed * dt, 9);
      ped.x = moved.x;
      ped.y = moved.y;
      ped.angle = Math.atan2(ped.fleeY, ped.fleeX);
      if (Math.hypot(ped.x - player.x, ped.y - player.y) > 500 || moved.blocked) ped.state = 'walk';
      continue;
    }
    updateWalker(ped, dt, world.city);
  }
  // Cars knock peds down; the player's car does it with consequences.
  for (const car of world.cars) {
    if (Math.abs(car.speed) < 60 || car.dead) continue;
    for (const ped of world.peds) {
      if (ped.state !== 'walk' && ped.state !== 'flee') continue;
      const d = Math.hypot(ped.x - car.x, ped.y - car.y);
      if (d < 26) {
        ped.state = 'down';
        ped.downTimer = 4;
        ped.hp -= 60;
        world.burst(ped.x, ped.y, '#c1121f', 10, 140);
        if (car.driver === 'player') {
          world.addHeat(15, 'pedestrian hit');
          world.stats.kills += ped.hp <= 0 ? 1 : 0;
          if (ped.hp <= 0) ped.state = 'dead';
        }
      }
    }
  }
}
