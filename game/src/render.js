// Neon Harbor — the renderer: the city, the cars, the people and the
// effects, painted top-down on one canvas with a camera that follows the
// player. Screen-space chrome (HUD, minimap) lives in hud.js.

import { BEACH_Y, PALETTE, ROAD_W, SEA_Y, WORLD_H, WORLD_W } from './config.js';

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let viewW = 1280;
  let viewH = 800;

  function resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    viewW = window.innerWidth;
    viewH = window.innerHeight;
    canvas.width = Math.round(viewW * ratio);
    canvas.height = Math.round(viewH * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }
  resize();
  window.addEventListener('resize', resize);

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawGround(world) {
    const { city } = world;
    ctx.fillStyle = PALETTE.ground;
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    // Sea and sand along the south edge.
    ctx.fillStyle = PALETTE.seaDeep;
    ctx.fillRect(0, SEA_Y, WORLD_W, WORLD_H - SEA_Y);
    ctx.fillStyle = PALETTE.sea;
    ctx.fillRect(0, SEA_Y, WORLD_W, 26);
    ctx.fillStyle = PALETTE.sand;
    ctx.fillRect(0, BEACH_Y, WORLD_W, SEA_Y - BEACH_Y);
    // Parks and the plaza.
    for (const park of city.parks) {
      ctx.fillStyle = park.plaza ? '#e6ddc0' : PALETTE.grass;
      ctx.fillRect(park.x, park.y, park.w, park.h);
    }
    // Sidewalks, then asphalt, then lane dashes.
    for (const rx of city.roadsV) {
      ctx.fillStyle = PALETTE.sidewalk;
      ctx.fillRect(rx - ROAD_W / 2 - 10, 0, ROAD_W + 20, BEACH_Y);
      ctx.fillStyle = PALETTE.road;
      ctx.fillRect(rx - ROAD_W / 2, 0, ROAD_W, BEACH_Y);
    }
    for (const ry of city.roadsH) {
      ctx.fillStyle = PALETTE.sidewalk;
      ctx.fillRect(0, ry - ROAD_W / 2 - 10, WORLD_W, ROAD_W + 20);
      ctx.fillStyle = PALETTE.road;
      ctx.fillRect(0, ry - ROAD_W / 2, WORLD_W, ROAD_W);
    }
    ctx.fillStyle = PALETTE.lane;
    for (const rx of city.roadsV) {
      for (let y = 20; y < BEACH_Y; y += 56) ctx.fillRect(rx - 2, y, 4, 28);
    }
    for (const ry of city.roadsH) {
      for (let x = 20; x < WORLD_W; x += 56) ctx.fillRect(x, ry - 2, 28, 4);
    }
    // Dock containers near the docks landmark.
    const docks = city.landmarks.docks;
    const containerColors = ['#e63946', '#2a9d8f', '#e9c46a', '#457b9d', '#f4a261'];
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = containerColors[i % containerColors.length];
      ctx.fillRect(docks.x + 90 + (i % 4) * 70, docks.y - 130 + Math.floor(i / 4) * 42, 60, 32);
    }
  }

  function drawBuildings(world) {
    for (const b of world.city.buildings) {
      // Drop shadow to the south-east, scaled by the building's height.
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(b.x + b.height * 0.4, b.y + b.height * 0.4, b.w, b.h);
      ctx.fillStyle = b.roof;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x + 4, b.y + 4, b.w - 8, b.h - 8);
      // Rooftop detail: a skylight block and an AC unit.
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(b.x + b.w * 0.2, b.y + b.h * 0.25, b.w * 0.25, b.h * 0.2);
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(b.x + b.w * 0.6, b.y + b.h * 0.6, b.w * 0.18, b.h * 0.18);
    }
    for (const t of world.city.trees) {
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.beginPath();
      ctx.arc(t.x + 4, t.y + 5, t.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#5da24a';
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#7cc46a';
      ctx.beginPath();
      ctx.arc(t.x - 3, t.y - 3, t.r * 0.55, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawBeacon(world) {
    const target = world.missions.objectiveTarget() || world.missions.startAt();
    if (!target) return;
    const active = !!world.missions.objectiveTarget();
    const pulse = 0.6 + 0.4 * Math.sin(world.time * 4);
    const color = active ? '#ffd166' : '#4ecdc4';
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.16 * pulse + 0.08;
    ctx.fillRect(target.x - 26, target.y - 340, 52, 340);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(target.x, target.y, 34 + pulse * 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.save();
    ctx.translate(target.x, target.y - 46 - pulse * 8);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = color;
    ctx.fillRect(-11, -11, 22, 22);
    ctx.restore();
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#0e2a3a';
    ctx.fillText(target.label, target.x + 1, target.y + 58);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(target.label, target.x, target.y + 57);
  }

  function drawCar(car, time, isPlayer) {
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    if (car.dead) {
      ctx.fillStyle = '#22252c';
    } else {
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      roundRect(-car.w / 2 + 3, -car.h / 2 + 4, car.w, car.h, 8);
      ctx.fill();
      ctx.fillStyle = car.color;
    }
    roundRect(-car.w / 2, -car.h / 2, car.w, car.h, 8);
    ctx.fill();
    if (!car.dead) {
      // Windshield, rear window, roof.
      ctx.fillStyle = 'rgba(180,220,235,0.9)';
      roundRect(6, -car.h / 2 + 3, 10, car.h - 6, 3);
      ctx.fill();
      roundRect(-16, -car.h / 2 + 3, 8, car.h - 6, 3);
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      roundRect(-6, -car.h / 2 + 4, 12, car.h - 8, 3);
      ctx.fill();
      // Headlights and brake lights.
      ctx.fillStyle = '#fff8d6';
      ctx.fillRect(car.w / 2 - 3, -car.h / 2 + 2, 3, 5);
      ctx.fillRect(car.w / 2 - 3, car.h / 2 - 7, 3, 5);
      ctx.fillStyle = car.brake ? '#ff2e2e' : '#b03030';
      ctx.fillRect(-car.w / 2, -car.h / 2 + 2, 3, 5);
      ctx.fillRect(-car.w / 2, car.h / 2 - 7, 3, 5);
      if (car.siren) {
        const flash = Math.floor(time * 6) % 2 === 0;
        ctx.fillStyle = flash ? '#ff2e2e' : '#2e6bff';
        ctx.fillRect(-4, -car.h / 2 - 2, 8, 5);
        ctx.fillStyle = flash ? '#2e6bff' : '#ff2e2e';
        ctx.fillRect(-4, car.h / 2 - 3, 8, 5);
        ctx.fillStyle = '#f1faee';
        roundRect(-car.w / 2 + 4, -car.h / 2 + 2, 14, car.h - 4, 3);
        ctx.fill();
      }
    }
    ctx.restore();
    if (isPlayer) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(car.x, car.y - 34);
      ctx.lineTo(car.x - 8, car.y - 48);
      ctx.lineTo(car.x + 8, car.y - 48);
      ctx.closePath();
      ctx.fill();
    }
    if (car.dead && car.smoke > 0) {
      ctx.fillStyle = `rgba(60,60,60,${0.5 * car.smoke})`;
      ctx.beginPath();
      ctx.arc(car.x + Math.sin(time * 3) * 4, car.y - 8, 10 + car.smoke * 8, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawPed(ped) {
    if (ped.state === 'dead') {
      ctx.fillStyle = 'rgba(150,20,20,0.55)';
      ctx.beginPath();
      ctx.ellipse(ped.x, ped.y, 14, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = ped.color;
      ctx.beginPath();
      ctx.ellipse(ped.x, ped.y, 9, 6, ped.angle, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    if (ped.state === 'down') {
      ctx.fillStyle = ped.color;
      ctx.beginPath();
      ctx.ellipse(ped.x, ped.y, 11, 6, ped.angle, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    ctx.fillStyle = ped.color;
    ctx.beginPath();
    ctx.arc(ped.x, ped.y, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f2c89b';
    ctx.beginPath();
    ctx.arc(ped.x + Math.cos(ped.angle) * 3, ped.y + Math.sin(ped.angle) * 3, 4.5, 0, Math.PI * 2);
    ctx.fill();
    if (ped.hostile) {
      ctx.strokeStyle = ped.cop ? '#2e6bff' : '#ff2e2e';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(ped.x, ped.y, 13, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawPlayer(world, input) {
    const player = world.player;
    if (!player.onFoot) return;
    // Direction tick, body, head — Kai wears a teal jacket and a cap.
    ctx.strokeStyle = '#0e2a3a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(player.x, player.y);
    ctx.lineTo(player.x + Math.cos(player.aimAngle) * 20, player.y + Math.sin(player.aimAngle) * 20);
    ctx.stroke();
    ctx.fillStyle = '#17a2b8';
    ctx.beginPath();
    ctx.arc(player.x, player.y, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f2c89b';
    ctx.beginPath();
    ctx.arc(player.x, player.y, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.arc(player.x, player.y - 2, 5.5, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(player.x, player.y, 14, 0, Math.PI * 2);
    ctx.stroke();
    void input;
  }

  function drawBulletsAndParticles(world) {
    ctx.lineWidth = 2;
    for (const b of world.bullets) {
      ctx.strokeStyle = b.from === 'player' ? '#ffe66d' : '#ff8fa3';
      ctx.beginPath();
      ctx.moveTo(b.x - b.vx * 0.025, b.y - b.vy * 0.025);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    for (const p of world.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function draw(world) {
    ctx.setTransform(Math.min(window.devicePixelRatio || 1, 2), 0, 0, Math.min(window.devicePixelRatio || 1, 2), 0, 0);
    ctx.fillStyle = '#0e2a3a';
    ctx.fillRect(0, 0, viewW, viewH);
    const shakeX = world.shake ? (Math.random() - 0.5) * world.shake : 0;
    const shakeY = world.shake ? (Math.random() - 0.5) * world.shake : 0;
    ctx.save();
    ctx.translate(viewW / 2 - world.camera.x + shakeX, viewH / 2 - world.camera.y + shakeY);
    drawGround(world);
    drawBuildings(world);
    drawBeacon(world);
    for (const car of world.cars) drawCar(car, world.time, world.player.car === car);
    for (const ped of world.peds) drawPed(ped);
    drawPlayer(world);
    drawBulletsAndParticles(world);
    ctx.restore();

    // Hurt vignette: the screen bleeds red at the edges.
    if (world.hurtFlash > 0) {
      const grad = ctx.createRadialGradient(viewW / 2, viewH / 2, Math.min(viewW, viewH) * 0.35, viewW / 2, viewH / 2, Math.max(viewW, viewH) * 0.75);
      grad.addColorStop(0, 'rgba(255,0,0,0)');
      grad.addColorStop(1, `rgba(255,0,0,${0.45 * world.hurtFlash})`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, viewW, viewH);
    }
    return { w: viewW, h: viewH };
  }

  return { draw, size: () => ({ w: viewW, h: viewH }) };
}
