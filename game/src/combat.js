// Combat: bullets, the player's pistol and fists, and the damage they do. Bullets fly
// straight until they hit a building, a car, a person or their range ends; every hit
// leaves a spark the renderer can draw. Enemies use the same bullets as the player.

import { PISTOL, PLAYER } from './config.js';
import { solidAt } from './city.js';

export function createBullet(x, y, angle, owner, damage) {
  return {
    x, y,
    vx: Math.cos(angle) * PISTOL.bulletSpeed,
    vy: Math.sin(angle) * PISTOL.bulletSpeed,
    owner, // 'player' | 'enemy' | 'police'
    damage,
    travelled: 0,
    alive: true,
  };
}

/**
 * Fire the pistol from (x, y) toward angle. Returns the bullet, or null when the
 * shooter is still on cooldown — the caller owns the cooldown timer.
 */
export function firePistol(bullets, x, y, angle, owner, random) {
  const spread = (random() - 0.5) * 2 * PISTOL.spread;
  const bullet = createBullet(x + Math.cos(angle) * 18, y + Math.sin(angle) * 18, angle + spread, owner, PISTOL.damage);
  bullets.push(bullet);
  return bullet;
}

/**
 * One step for all bullets. `targets` is { player, cars, peds, enemies }; hits call the
 * matching callback in `on` and mark the bullet dead. Returns the hit events as flags.
 */
export function updateBullets(bullets, dt, city, targets, on) {
  for (const bullet of bullets) {
    if (!bullet.alive) continue;
    const stepLen = PISTOL.bulletSpeed * dt;
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    bullet.travelled += stepLen;
    if (bullet.travelled > PISTOL.range) {
      bullet.alive = false;
      continue;
    }
    if (solidAt(city, bullet.x, bullet.y)) {
      bullet.alive = false;
      on.spark?.(bullet.x, bullet.y);
      continue;
    }
    if (bullet.owner !== 'player' && targets.player) {
      const p = targets.player;
      if (Math.hypot(p.x - bullet.x, p.y - bullet.y) < PLAYER.radius + 4) {
        bullet.alive = false;
        on.playerHit?.(bullet.damage, bullet.owner);
        continue;
      }
    }
    let hit = false;
    for (const car of targets.cars) {
      if (car.dead) continue;
      if (Math.hypot(car.x - bullet.x, car.y - bullet.y) < car.radius * 0.8) {
        bullet.alive = false;
        on.carHit?.(car, bullet.damage, bullet.owner);
        hit = true;
        break;
      }
    }
    if (hit) continue;
    if (bullet.owner === 'player') {
      for (const ped of targets.peds) {
        if (ped.state === 'down') continue;
        if (Math.hypot(ped.x - bullet.x, ped.y - bullet.y) < ped.radius + 4) {
          bullet.alive = false;
          on.pedHit?.(ped, bullet.damage);
          hit = true;
          break;
        }
      }
      if (hit) continue;
      for (const enemy of targets.enemies) {
        if (enemy.health <= 0) continue;
        if (Math.hypot(enemy.x - bullet.x, enemy.y - bullet.y) < enemy.radius + 4) {
          bullet.alive = false;
          on.enemyHit?.(enemy, bullet.damage);
          hit = true;
          break;
        }
      }
    }
  }
  // Compact the list in place.
  let write = 0;
  for (let read = 0; read < bullets.length; read += 1) {
    if (bullets[read].alive) bullets[write++] = bullets[read];
  }
  bullets.length = write;
}

/**
 * A punch in front of (x, y) facing angle: hurts the nearest person or enemy in range
 * and shoves them back. Returns the victim, or null.
 */
export function punch(x, y, angle, targets) {
  const fx = Math.cos(angle);
  const fy = Math.sin(angle);
  let best = null;
  let bestDist = PLAYER.punchRange;
  const consider = (person) => {
    const dx = person.x - x;
    const dy = person.y - y;
    const dist = Math.hypot(dx, dy);
    if (dist > bestDist + person.radius) return;
    if (dist > 0 && (dx * fx + dy * fy) / dist < 0.3) return;
    bestDist = dist;
    best = person;
  };
  for (const ped of targets.peds) if (ped.state !== 'down') consider(ped);
  for (const enemy of targets.enemies) if (enemy.health > 0) consider(enemy);
  if (!best) return null;
  best.health -= PLAYER.punchDamage;
  best.x += fx * 26;
  best.y += fy * 26;
  return best;
}
