// Neon Harbor — bullets and particles. A bullet is a fast point with a
// tracer; it stops at the first building, car, ped or player it meets.
// Particles are short-lived sparks, blood, smoke and muzzle flashes.

import { COMBAT } from './config.js';
import { damagePed } from './pedestrians.js';

export function fireBullet(world, x, y, angle, opts = {}) {
  const from = opts.from || 'player';
  world.bullets.push({
    x, y,
    vx: Math.cos(angle) * COMBAT.bulletSpeed,
    vy: Math.sin(angle) * COMBAT.bulletSpeed,
    life: COMBAT.bulletLife,
    from,
    damage: opts.damage ?? COMBAT.pistolDamage,
  });
  world.burst(x, y, '#ffd166', 3, 60);
  if (from === 'player') world.audio.shot();
  else world.audio.copShot();
}

export function burst(world, x, y, color, count, speed) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = speed * (0.3 + Math.random() * 0.7);
    world.particles.push({
      x, y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      life: 0.35 + Math.random() * 0.4,
      maxLife: 0.75,
      color,
      size: 2 + Math.random() * 3,
    });
  }
  if (world.particles.length > 400) world.particles.splice(0, world.particles.length - 400);
}

// Point-in-rotated-rectangle: the bullet test for cars.
function hitsCar(car, x, y) {
  const dx = x - car.x;
  const dy = y - car.y;
  const cos = Math.cos(-car.angle);
  const sin = Math.sin(-car.angle);
  const lx = dx * cos - dy * sin;
  const ly = dx * sin + dy * cos;
  return Math.abs(lx) < car.w / 2 && Math.abs(ly) < car.h / 2;
}

export function updateBullets(world, dt) {
  const player = world.player;
  for (let i = world.bullets.length - 1; i >= 0; i--) {
    const b = world.bullets[i];
    b.life -= dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    let dead = b.life <= 0;
    if (!dead && world.city.hitsBuilding(b.x, b.y, 1)) {
      world.burst(b.x, b.y, '#e8e0c8', 4, 90);
      dead = true;
    }
    if (!dead && b.from === 'player') {
      for (const ped of world.peds) {
        if (ped.state === 'dead') continue;
        if (Math.hypot(ped.x - b.x, ped.y - b.y) < 12) {
          damagePed(world, ped, b.damage, true);
          dead = true;
          break;
        }
      }
    }
    if (!dead) {
      for (const car of world.cars) {
        if (car.dead) continue;
        if (b.from === 'player' && player.car === car) continue;
        if (hitsCar(car, b.x, b.y)) {
          car.hp -= b.damage;
          world.burst(b.x, b.y, '#ff9f1c', 5, 120);
          if (car.hp <= 0 && !car.dead) {
            car.dead = true;
            car.speed = 0;
            car.smoke = 1;
            world.onCarDestroyed(car);
          }
          dead = true;
          break;
        }
      }
    }
    if (!dead && b.from !== 'player') {
      if (Math.hypot(player.x - b.x, player.y - b.y) < 12) {
        world.damagePlayer(b.damage, b.from === 'cop' ? 'police fire' : 'enemy fire');
        dead = true;
      }
    }
    if (dead) world.bullets.splice(i, 1);
  }
}

export function updateParticles(world, dt) {
  for (let i = world.particles.length - 1; i >= 0; i--) {
    const p = world.particles[i];
    p.life -= dt;
    if (p.life <= 0) {
      world.particles.splice(i, 1);
      continue;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 1 - 2.5 * dt;
    p.vy *= 1 - 2.5 * dt;
  }
}
