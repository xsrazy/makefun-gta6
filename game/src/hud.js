// Neon Harbor — the HUD: money and wanted stars, the mission tracker, the
// live minimap, health and ammo, flashes and prompts. All screen space, drawn
// after the world each frame.

import { PLAYER, ROAD_W, WORLD_H, WORLD_W } from './config.js';
import { districtAt } from './config.js';

const MAP_SIZE = 190;
const MAP_MARGIN = 16;

function panel(ctx, x, y, w, h, alpha = 0.55) {
  ctx.fillStyle = `rgba(8,18,28,${alpha})`;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 10);
  ctx.fill();
}

export function drawHud(ctx, world, viewW, viewH, input, state) {
  const player = world.player;
  ctx.textBaseline = 'alphabetic';

  // Top right: cash and wanted stars.
  panel(ctx, viewW - 218, 14, 202, 64);
  ctx.textAlign = 'right';
  ctx.font = 'bold 26px system-ui, sans-serif';
  ctx.fillStyle = '#7bed9f';
  ctx.fillText(`$${world.money.toLocaleString('en-US')}`, viewW - 32, 44);
  ctx.font = 'bold 22px system-ui, sans-serif';
  const stars = world.wantedStars();
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i < stars ? '#ffd166' : 'rgba(255,255,255,0.25)';
    ctx.fillText('★', viewW - 32 - (4 - i) * 26, 70);
  }

  // Top left: mission tracker and district.
  const mission = world.missions.active;
  const next = world.missions.next();
  panel(ctx, 14, 14, 330, mission ? 86 : 64);
  ctx.textAlign = 'left';
  if (mission) {
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.fillStyle = '#ffd166';
    ctx.fillText(mission.def.title.toUpperCase(), 28, 38);
    ctx.font = '15px system-ui, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(world.missions.objectiveLabel(), 28, 62, 302);
    if (mission.def.timeLimit) {
      ctx.font = 'bold 15px system-ui, sans-serif';
      ctx.fillStyle = mission.timer < 30 ? '#ff5964' : '#4ecdc4';
      const t = Math.max(0, Math.ceil(mission.timer));
      ctx.fillText(`${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`, 28, 86);
    }
  } else if (next) {
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.fillStyle = '#4ecdc4';
    ctx.fillText('NEXT JOB', 28, 38);
    ctx.font = '15px system-ui, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`${next.title} — reach the marker`, 28, 60);
  } else {
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.fillStyle = '#4ecdc4';
    ctx.fillText('NEON HARBOR IS YOURS', 28, 40);
  }
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fillText(districtAt(player.x, player.y), 28, mission ? 100 : 78);

  drawMinimap(ctx, world, viewW, viewH);
  drawVitals(ctx, world, viewW, viewH);
  drawFlashes(ctx, world, viewW, viewH);
  drawFeed(ctx, world, viewW, viewH);
  drawPrompts(ctx, world, viewW, viewH, state);
  if (state === 'playing' && player.onFoot) drawCrosshair(ctx, input);
}

function drawMinimap(ctx, world, viewW, viewH) {
  const x0 = MAP_MARGIN;
  const y0 = viewH - MAP_MARGIN - MAP_SIZE;
  const sx = MAP_SIZE / WORLD_W;
  const sy = MAP_SIZE / WORLD_H;
  panel(ctx, x0 - 6, y0 - 6, MAP_SIZE + 12, MAP_SIZE + 12, 0.6);
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x0, y0, MAP_SIZE, MAP_SIZE, 8);
  ctx.clip();
  ctx.fillStyle = '#d9c48f';
  ctx.fillRect(x0, y0, MAP_SIZE, MAP_SIZE);
  ctx.fillStyle = '#2fa8b8';
  ctx.fillRect(x0, y0 + 2180 * sy, MAP_SIZE, MAP_SIZE - 2180 * sy);
  ctx.fillStyle = '#3d4450';
  for (const rx of world.city.roadsV) ctx.fillRect(x0 + rx * sx - 1.5, y0, 3, MAP_SIZE);
  for (const ry of world.city.roadsH) ctx.fillRect(x0, y0 + ry * sy - 1.5, MAP_SIZE, 3);
  ctx.fillStyle = 'rgba(120,90,60,0.5)';
  for (const b of world.city.buildings) {
    ctx.fillRect(x0 + b.x * sx, y0 + b.y * sy, Math.max(2, b.w * sx), Math.max(2, b.h * sy));
  }
  const blip = (x, y, color, r = 4) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x0 + x * sx, y0 + y * sy, r, 0, Math.PI * 2);
    ctx.fill();
  };
  // Mission target, then the next job's marker.
  const target = world.missions.objectiveTarget();
  if (target) {
    const pulse = 4 + 2 * Math.sin(world.time * 5);
    blip(target.x, target.y, '#ffd166', pulse);
  } else {
    const at = world.missions.startAt();
    if (at) blip(at.x, at.y, '#4ecdc4', 5);
  }
  for (const car of world.cars) {
    if (car.driver === 'cop' && !car.dead) blip(car.x, car.y, Math.floor(world.time * 4) % 2 ? '#ff2e2e' : '#2e6bff', 3.5);
  }
  for (const ped of world.peds) {
    if (ped.hostile && ped.state !== 'dead') blip(ped.x, ped.y, '#ff2e2e', 3);
  }
  // The player: a white arrow pointing where they face.
  ctx.save();
  ctx.translate(x0 + world.player.x * sx, y0 + world.player.y * sy);
  ctx.rotate(world.player.angle);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#0e2a3a';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(7, 0);
  ctx.lineTo(-5, -5);
  ctx.lineTo(-5, 5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  ctx.restore();
  void ROAD_W;
}

function drawVitals(ctx, world, viewW, viewH) {
  const player = world.player;
  const y0 = viewH - MAP_MARGIN - MAP_SIZE - 66;
  panel(ctx, MAP_MARGIN - 6, y0, 202, 54);
  // Health bar.
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.fillRect(MAP_MARGIN + 8, y0 + 12, 174, 12);
  const hpFrac = Math.max(0, player.health / PLAYER.maxHealth);
  ctx.fillStyle = hpFrac > 0.3 ? '#7bed9f' : '#ff5964';
  ctx.fillRect(MAP_MARGIN + 8, y0 + 12, 174 * hpFrac, 12);
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(`HP ${Math.ceil(player.health)}`, MAP_MARGIN + 8, y0 + 42);
  if (player.onFoot) {
    ctx.fillText(`AMMO ${player.reloading ? 'RELOADING' : `${player.ammo} / ${PLAYER.magSize}`}`, MAP_MARGIN + 78, y0 + 42);
  } else {
    ctx.fillText(`CAR ${Math.max(0, Math.ceil(player.car ? player.car.hp : 0))}%`, MAP_MARGIN + 78, y0 + 42);
  }

  // Speedometer, bottom right, while driving.
  if (!player.onFoot && player.car) {
    const kmh = Math.round(Math.abs(player.car.speed) * 0.36);
    panel(ctx, viewW - 148, viewH - 76, 132, 60);
    ctx.textAlign = 'right';
    ctx.font = 'bold 30px system-ui, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(String(kmh), viewW - 34, viewH - 44);
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText('KM/H', viewW - 34, viewH - 28);
  }
}

function drawFlashes(ctx, world, viewW, viewH) {
  ctx.textAlign = 'center';
  world.flashes.forEach((f, i) => {
    const alpha = f.t < 0.2 ? f.t / 0.2 : f.t > f.dur - 0.6 ? (f.dur - f.t) / 0.6 : 1;
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    ctx.font = '900 44px system-ui, sans-serif';
    ctx.fillStyle = '#0e2a3a';
    ctx.fillText(f.text, viewW / 2 + 3, viewH * 0.3 + i * 54 + 3);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, viewW / 2, viewH * 0.3 + i * 54);
  });
  ctx.globalAlpha = 1;
}

function drawFeed(ctx, world, viewW, viewH) {
  ctx.textAlign = 'center';
  world.feed.forEach((m, i) => {
    const alpha = m.t > m.dur - 1 ? m.dur - m.t : 1;
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    ctx.font = '15px system-ui, sans-serif';
    ctx.fillStyle = '#0e2a3a';
    ctx.fillText(m.text, viewW / 2 + 1, viewH - 30 - (world.feed.length - 1 - i) * 22 + 1);
    ctx.fillStyle = '#eaf6f9';
    ctx.fillText(m.text, viewW / 2, viewH - 30 - (world.feed.length - 1 - i) * 22);
  });
  ctx.globalAlpha = 1;
}

function drawPrompts(ctx, world, viewW, viewH, state) {
  if (state !== 'playing') return;
  const player = world.player;
  ctx.textAlign = 'center';
  if (player.onFoot) {
    const near = world.cars.some((c) => !c.dead && Math.hypot(c.x - player.x, c.y - player.y) < 75);
    if (near) {
      ctx.font = 'bold 17px system-ui, sans-serif';
      ctx.fillStyle = '#ffd166';
      ctx.fillText('Press E to enter car', viewW / 2, viewH - 84);
    }
  }
  if (world.time < 14) {
    ctx.font = '14px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText('WASD move/drive · Mouse aim · Click shoot · E enter car · P pause', viewW / 2, 108);
  }
}

function drawCrosshair(ctx, input) {
  const { x, y } = input.mouse;
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, 10, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - 14, y);
  ctx.lineTo(x - 6, y);
  ctx.moveTo(x + 6, y);
  ctx.lineTo(x + 14, y);
  ctx.moveTo(x, y - 14);
  ctx.lineTo(x, y - 6);
  ctx.moveTo(x, y + 6);
  ctx.lineTo(x, y + 14);
  ctx.stroke();
}
