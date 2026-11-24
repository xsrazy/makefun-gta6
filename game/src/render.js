// Drawing the world: the camera, the ground, roads, buildings, trees, cars, people,
// bullets and particles, in that order. Flat shapes with soft shadows and a warm
// afternoon palette — the sun-soaked look of Solmar Bay. The HUD and menus live in
// hud.js and draw on top of this, in screen space.

import { PALETTE, ROADS, SHORE, VIEW, WORLD } from './config.js';
import { districtAt } from './city.js';

const ZOOM = 1.1;
const HALF_ROAD = ROADS.width / 2;

/** Block rectangles between the roads, for the sidewalk ground. */
function blockRects() {
  const rects = [];
  const xs = [0, ...ROADS.vertical.map((x) => x - HALF_ROAD)];
  const xe = [...ROADS.vertical.map((x) => x + HALF_ROAD), WORLD.width];
  const ys = [0, ...ROADS.horizontal.map((y) => y - HALF_ROAD)];
  const ye = [...ROADS.horizontal.map((y) => y + HALF_ROAD), WORLD.height];
  for (let r = 0; r < ys.length; r += 1) {
    for (let c = 0; c < xs.length; c += 1) {
      rects.push({ x: xe[c], y: ye[r], w: xs[c + 1] - xe[c], h: ys[r + 1] - ye[r] });
    }
  }
  return rects;
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const blocks = blockRects();
  const fonts = new Map();

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / VIEW.width, height / VIEW.height);
    view.x = (width - VIEW.width * view.scale) / 2;
    view.y = (height - VIEW.height * view.scale) / 2;
  }

  function font(size, weight = 400) {
    const key = `${weight}/${size}`;
    if (!fonts.has(key)) fonts.set(key, `${weight} ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`);
    return fonts.get(key);
  }

  /** Convert a logical screen point (1280x720) to world coordinates. */
  function toWorld(sx, sy, camera) {
    return {
      x: camera.x + (sx - VIEW.width / 2) / ZOOM,
      y: camera.y + (sy - VIEW.height / 2) / ZOOM,
    };
  }

  function inView(x, y, margin, camera) {
    const hw = VIEW.width / 2 / ZOOM + margin;
    const hh = VIEW.height / 2 / ZOOM + margin;
    return x > camera.x - hw && x < camera.x + hw && y > camera.y - hh && y < camera.y + hh;
  }

  function drawGround(state, camera) {
    const ctx = context;
    // Grass base.
    ctx.fillStyle = PALETTE.grass;
    ctx.fillRect(camera.x - 800, camera.y - 500, 1600, 1000);
    // Mow stripes for a little texture.
    ctx.fillStyle = PALETTE.grassDark;
    const stripeTop = Math.floor((camera.y - 500) / 120) * 120;
    for (let y = stripeTop; y < camera.y + 500; y += 240) {
      ctx.fillRect(camera.x - 800, y, 1600, 120);
    }
    // Sidewalk blocks.
    ctx.fillStyle = PALETTE.sidewalk;
    for (const b of blocks) {
      if (!inView(b.x + b.w / 2, b.y + b.h / 2, Math.max(b.w, b.h) / 2, camera)) continue;
      ctx.fillRect(b.x, b.y, b.w, b.h);
    }
    // Parks: darker grass with a path.
    for (const park of state.city.parks) {
      if (!inView(park.x + park.w / 2, park.y + park.h / 2, park.w / 2, camera)) continue;
      ctx.fillStyle = '#6da352';
      ctx.fillRect(park.x, park.y, park.w, park.h);
      ctx.fillStyle = '#d8cfae';
      ctx.fillRect(park.x + park.w / 2 - 8, park.y, 16, park.h);
      ctx.fillRect(park.x, park.y + park.h / 2 - 8, park.w, 16);
    }
    // Parking lots: asphalt with bay lines.
    for (const lot of state.city.lots) {
      if (!inView(lot.x + lot.w / 2, lot.y + lot.h / 2, lot.w / 2, camera)) continue;
      ctx.fillStyle = '#4a4d52';
      ctx.fillRect(lot.x, lot.y, lot.w, lot.h);
      ctx.strokeStyle = '#c8c8c8';
      ctx.lineWidth = 2;
      for (let x = lot.x + 30; x < lot.x + lot.w - 20; x += 42) {
        ctx.beginPath();
        ctx.moveTo(x, lot.y + 12);
        ctx.lineTo(x, lot.y + 52);
        ctx.moveTo(x, lot.y + lot.h - 12);
        ctx.lineTo(x, lot.y + lot.h - 52);
        ctx.stroke();
      }
    }
    // Beach and sea.
    ctx.fillStyle = PALETTE.sand;
    ctx.fillRect(camera.x - 800, SHORE.sandTop, 1600, SHORE.waterTop - SHORE.sandTop);
    ctx.fillStyle = PALETTE.water;
    ctx.fillRect(camera.x - 800, SHORE.waterTop, 1600, WORLD.height - SHORE.waterTop + 200);
    ctx.fillStyle = PALETTE.waterDeep;
    const waveOff = (state.time * 14) % 46;
    for (let x = camera.x - 800; x < camera.x + 800; x += 46) {
      ctx.fillRect(x + waveOff - 46, SHORE.waterTop + 26, 22, 3);
      ctx.fillRect(x + ((waveOff + 23) % 46) - 46, SHORE.waterTop + 52, 22, 3);
    }
    // Roads: sidewalk edge, asphalt, centre dashes.
    for (const cx of ROADS.vertical) {
      ctx.fillStyle = '#b5ad9c';
      ctx.fillRect(cx - HALF_ROAD - 8, 0, ROADS.width + 16, SHORE.sandTop);
      ctx.fillStyle = PALETTE.road;
      ctx.fillRect(cx - HALF_ROAD, 0, ROADS.width, SHORE.sandTop);
    }
    for (const cy of ROADS.horizontal) {
      ctx.fillStyle = '#b5ad9c';
      ctx.fillRect(0, cy - HALF_ROAD - 8, WORLD.width, ROADS.width + 16);
      ctx.fillStyle = PALETTE.road;
      ctx.fillRect(0, cy - HALF_ROAD, WORLD.width, ROADS.width);
    }
    ctx.fillStyle = PALETTE.laneMark;
    const dashOff = (state.time * 0) % 44;
    for (const cx of ROADS.vertical) {
      for (let y = dashOff; y < SHORE.sandTop; y += 44) ctx.fillRect(cx - 2, y, 4, 24);
    }
    for (const cy of ROADS.horizontal) {
      for (let x = dashOff; x < WORLD.width; x += 44) ctx.fillRect(x, cy - 2, 24, 4);
    }
    // Crosswalks at the downtown intersections.
    ctx.fillStyle = '#e8e8e8';
    for (const cx of [1550, 2150, 2750]) {
      for (const cy of [900, 1500, 2100]) {
        for (let i = -4; i <= 4; i += 1) {
          ctx.fillRect(cx + i * 11 - 3, cy - HALF_ROAD - 14, 6, 12);
          ctx.fillRect(cx + i * 11 - 3, cy + HALF_ROAD + 2, 6, 12);
        }
      }
    }
  }

  function drawBuildings(state, camera) {
    const ctx = context;
    for (const b of state.city.buildings) {
      if (!inView(b.x + b.w / 2, b.y + b.h / 2, Math.max(b.w, b.h) / 2 + 40, camera)) continue;
      const lift = 4 + b.floors * 2;
      ctx.fillStyle = 'rgba(20, 24, 20, 0.28)';
      ctx.fillRect(b.x + lift, b.y + lift + 4, b.w, b.h);
      ctx.fillStyle = b.wall;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = b.roof;
      ctx.fillRect(b.x + 6, b.y + 6, b.w - 12, b.h - 12);
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.fillRect(b.x + 6, b.y + 6, b.w - 12, 5);
      // Rooftop details: vents and skylights.
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      const nx = Math.max(1, Math.floor(b.w / 70));
      const ny = Math.max(1, Math.floor(b.h / 70));
      for (let i = 0; i < nx; i += 1) {
        for (let j = 0; j < ny; j += 1) {
          ctx.fillRect(b.x + 16 + i * 70, b.y + 16 + j * 70, 22, 14);
        }
      }
      if (b.landmark) {
        ctx.font = font(15, 700);
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(b.landmark === 'hospital' ? 'HOSPITAL' : 'SBPD', b.x + b.w / 2, b.y + b.h / 2);
      }
    }
    for (const c of state.city.crates) {
      if (!inView(c.x, c.y, 60, camera)) continue;
      ctx.fillStyle = 'rgba(20,24,20,0.25)';
      ctx.fillRect(c.x + 5, c.y + 6, c.w, c.h);
      ctx.fillStyle = '#a87a4a';
      ctx.fillRect(c.x, c.y, c.w, c.h);
      ctx.strokeStyle = '#7a5630';
      ctx.lineWidth = 2;
      ctx.strokeRect(c.x + 2, c.y + 2, c.w - 4, c.h - 4);
    }
  }

  function drawTrees(state, camera) {
    const ctx = context;
    for (const t of state.city.trees) {
      if (!inView(t.x, t.y, 40, camera)) continue;
      ctx.fillStyle = 'rgba(20,24,20,0.25)';
      ctx.beginPath();
      ctx.ellipse(t.x + 6, t.y + 8, 14, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      if (t.palm) {
        ctx.strokeStyle = '#7a5a3a';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(t.x, t.y + 4);
        ctx.lineTo(t.x, t.y - 2);
        ctx.stroke();
        ctx.strokeStyle = '#3f8f4f';
        ctx.lineWidth = 3;
        for (let i = 0; i < 6; i += 1) {
          const a = (i / 6) * Math.PI * 2 + t.x;
          ctx.beginPath();
          ctx.moveTo(t.x, t.y - 2);
          ctx.quadraticCurveTo(t.x + Math.cos(a) * 10, t.y - 2 + Math.sin(a) * 10 - 4, t.x + Math.cos(a) * 17, t.y - 2 + Math.sin(a) * 17 + 3);
          ctx.stroke();
        }
      } else {
        ctx.fillStyle = '#4a8f3f';
        ctx.beginPath();
        ctx.arc(t.x, t.y, 13, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#5da352';
        ctx.beginPath();
        ctx.arc(t.x - 4, t.y - 4, 8, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawCarShape(car, time) {
    const ctx = context;
    const type = car.type;
    const L = type.length;
    const W = type.width;
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    ctx.fillStyle = 'rgba(20,24,20,0.3)';
    ctx.beginPath();
    ctx.ellipse(4, 6, L / 2, W / 2 + 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = car.color;
    ctx.beginPath();
    ctx.roundRect(-L / 2, -W / 2, L, W, 7);
    ctx.fill();
    // Cabin and windshield.
    ctx.fillStyle = 'rgba(20,30,40,0.85)';
    ctx.beginPath();
    ctx.roundRect(-L * 0.18, -W / 2 + 3, L * 0.3, W - 6, 4);
    ctx.fill();
    ctx.fillStyle = car.color;
    ctx.globalAlpha = 0.55;
    ctx.fillRect(-L * 0.05, -W / 2 + 4, L * 0.16, W - 8);
    ctx.globalAlpha = 1;
    // Headlights and taillights.
    ctx.fillStyle = '#fff8c8';
    ctx.fillRect(L / 2 - 4, -W / 2 + 3, 3, 5);
    ctx.fillRect(L / 2 - 4, W / 2 - 8, 3, 5);
    ctx.fillStyle = '#ff3b30';
    ctx.fillRect(-L / 2 + 1, -W / 2 + 3, 3, 5);
    ctx.fillRect(-L / 2 + 1, W / 2 - 8, 3, 5);
    if (car.typeId === 'taxi') {
      ctx.fillStyle = '#111111';
      ctx.font = font(9, 800);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('TAXI', 0, 0);
    }
    if (car.typeId === 'pickup') {
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(-L / 2 + 4, -W / 2 + 4, L * 0.3, W - 8);
    }
    if (car.driver === 'police') {
      ctx.fillStyle = '#e8e8e8';
      ctx.fillRect(-L * 0.28, -W / 2 + 2, L * 0.5, 5);
      ctx.fillRect(-L * 0.28, W / 2 - 7, L * 0.5, 5);
      // Flashing light bar.
      const red = car.sirenFlash;
      ctx.fillStyle = red ? '#ff2e2e' : '#ff8a8a';
      ctx.fillRect(-4, -W / 2 + 1, 8, 6);
      ctx.fillStyle = red ? '#7aa8ff' : '#2e6bff';
      ctx.fillRect(-4, W / 2 - 7, 8, 6);
      ctx.fillStyle = red ? 'rgba(255,46,46,0.25)' : 'rgba(46,107,255,0.25)';
      ctx.beginPath();
      ctx.arc(0, 0, 46, 0, Math.PI * 2);
      ctx.fill();
    }
    if (car.smoke) {
      ctx.fillStyle = 'rgba(40,40,40,0.35)';
      ctx.beginPath();
      ctx.arc(-L / 2 + 4 + Math.sin(time * 9) * 3, -4, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    if (car.dead) {
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.beginPath();
      ctx.roundRect(-L / 2, -W / 2, L, W, 7);
      ctx.fill();
      ctx.fillStyle = '#ff8c2e';
      ctx.beginPath();
      ctx.arc(-L / 4, 0, 5 + Math.sin(time * 20) * 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPersonShape(x, y, angle, shirt, pants, skin, stepPhase, speed, down, ring, ringColor) {
    const ctx = context;
    ctx.save();
    ctx.translate(x, y);
    if (down) {
      ctx.rotate(angle + Math.PI / 2);
      ctx.fillStyle = 'rgba(20,24,20,0.25)';
      ctx.beginPath();
      ctx.ellipse(2, 3, 14, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = shirt;
      ctx.beginPath();
      ctx.ellipse(0, 0, 13, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = skin;
      ctx.beginPath();
      ctx.arc(13, 0, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }
    if (ring) {
      ctx.strokeStyle = ringColor;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, 16, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(20,24,20,0.25)';
    ctx.beginPath();
    ctx.ellipse(2, 3, 10, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    // Legs swing with the walk cycle.
    const swing = speed > 10 ? Math.sin(stepPhase) * 4 : 0;
    const px = -Math.sin(angle);
    const py = Math.cos(angle);
    ctx.fillStyle = pants;
    ctx.beginPath();
    ctx.arc(px * 4 + Math.cos(angle) * swing, py * 4 + Math.sin(angle) * swing, 3.6, 0, Math.PI * 2);
    ctx.arc(-px * 4 - Math.cos(angle) * swing, -py * 4 - Math.sin(angle) * swing, 3.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = shirt;
    ctx.beginPath();
    ctx.arc(0, 0, 8.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(Math.cos(angle) * 2, Math.sin(angle) * 2, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawPickups(state, camera) {
    const ctx = context;
    for (const pack of state.packages) {
      if (pack.found || !inView(pack.x, pack.y, 40, camera)) continue;
      const bob = Math.sin(pack.bob) * 3;
      ctx.fillStyle = 'rgba(255,214,10,0.3)';
      ctx.beginPath();
      ctx.arc(pack.x, pack.y, 18 + Math.sin(pack.bob) * 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffd60a';
      ctx.fillRect(pack.x - 7, pack.y - 7 + bob, 14, 14);
      ctx.fillStyle = '#b8960a';
      ctx.fillRect(pack.x - 2, pack.y - 7 + bob, 4, 14);
    }
    for (const pack of state.healthPacks) {
      if (pack.taken || !inView(pack.x, pack.y, 40, camera)) continue;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(pack.x, pack.y, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#e5484d';
      ctx.fillRect(pack.x - 7, pack.y - 2.5, 14, 5);
      ctx.fillRect(pack.x - 2.5, pack.y - 7, 5, 14);
    }
    for (const pack of state.ammoPacks) {
      if (pack.taken || !inView(pack.x, pack.y, 40, camera)) continue;
      ctx.fillStyle = '#2e4a6b';
      ctx.beginPath();
      ctx.arc(pack.x, pack.y, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffd60a';
      ctx.font = font(11, 800);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('AMMO', pack.x, pack.y);
    }
  }

  function drawObjectiveBeacon(state, camera, objective) {
    if (!objective) return;
    const ctx = context;
    const { x, y } = objective;
    const pulse = 0.6 + Math.sin(state.time * 4) * 0.4;
    if (inView(x, y, 80, camera)) {
      const grad = ctx.createLinearGradient(0, y - 220, 0, y);
      grad.addColorStop(0, 'rgba(255,214,10,0)');
      grad.addColorStop(1, 'rgba(255,214,10,0.5)');
      ctx.fillStyle = grad;
      ctx.fillRect(x - 10, y - 220, 20, 220);
      ctx.strokeStyle = `rgba(255,214,10,${0.5 + pulse * 0.5})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, 26 + pulse * 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#ffd60a';
      ctx.save();
      ctx.translate(x, y - 34 - Math.sin(state.time * 3) * 5);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-8, -8, 16, 16);
      ctx.restore();
    }
  }

  function drawEntities(state, camera) {
    const ctx = context;
    for (const car of state.cars) {
      if (!inView(car.x, car.y, 80, camera)) continue;
      drawCarShape(car, state.time);
    }
    for (const ped of state.peds) {
      if (!inView(ped.x, ped.y, 40, camera)) continue;
      drawPersonShape(ped.x, ped.y, ped.angle, ped.shirt, ped.pants, ped.skin, ped.stepPhase, ped.speed, ped.state === 'down', false);
    }
    for (const cop of state.footCops) {
      if (!inView(cop.x, cop.y, 40, camera)) continue;
      drawPersonShape(cop.x, cop.y, cop.angle, cop.shirt, cop.pants, cop.skin, cop.stepPhase, 200, false, true, '#4da3ff');
    }
    for (const enemy of state.enemies) {
      if (!inView(enemy.x, enemy.y, 40, camera)) continue;
      drawPersonShape(enemy.x, enemy.y, enemy.angle, enemy.shirt, enemy.pants, enemy.skin, enemy.stepPhase, 100, false, true, '#ff5a4d');
      // Health bar over a wounded enemy.
      if (enemy.health < 50) {
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(enemy.x - 14, enemy.y - 26, 28, 5);
        ctx.fillStyle = '#ff5a4d';
        ctx.fillRect(enemy.x - 14, enemy.y - 26, 28 * (enemy.health / 50), 5);
      }
    }
    const p = state.player;
    if (!p.car && inView(p.x, p.y, 40, camera)) {
      drawPersonShape(p.x, p.y, p.angle, '#2e5fa3', '#2e3a4a', '#e8b88a', state.time * 8, Math.hypot(p.vx, p.vy), false, true, '#ffffff');
      // Danny's cap.
      ctx.fillStyle = '#c94f4f';
      ctx.beginPath();
      ctx.arc(p.x + Math.cos(p.angle) * 2, p.y + Math.sin(p.angle) * 2, 5.5, Math.PI, Math.PI * 2);
      ctx.fill();
    }
    // Bullets as tracers.
    ctx.strokeStyle = '#fff3a0';
    ctx.lineWidth = 2;
    for (const b of state.bullets) {
      if (!inView(b.x, b.y, 30, camera)) continue;
      ctx.beginPath();
      ctx.moveTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    // Particles.
    for (const pt of state.particles) {
      if (!inView(pt.x, pt.y, 20, camera)) continue;
      ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /** Paint one frame of the world; the HUD draws on top of this. */
  function draw(state, objective) {
    const camera = state.camera;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    context.save();
    context.translate(VIEW.width / 2, VIEW.height / 2);
    context.scale(ZOOM, ZOOM);
    context.translate(-camera.x, -camera.y);
    drawGround(state, camera);
    drawBuildings(state, camera);
    drawTrees(state, camera);
    drawPickups(state, camera);
    drawObjectiveBeacon(state, camera, objective);
    drawEntities(state, camera);
    context.restore();
    // Warm afternoon light and the hurt vignette, in screen space.
    const glare = context.createRadialGradient(VIEW.width * 0.82, 40, 60, VIEW.width * 0.82, 40, 700);
    glare.addColorStop(0, 'rgba(255, 214, 130, 0.14)');
    glare.addColorStop(1, 'rgba(255, 214, 130, 0)');
    context.fillStyle = glare;
    context.fillRect(0, 0, VIEW.width, VIEW.height);
    const p = state.player;
    if (p.health < 35 && !p.dead) {
      const pulse = 0.25 + Math.sin(state.time * 5) * 0.1;
      const vig = context.createRadialGradient(VIEW.width / 2, VIEW.height / 2, 240, VIEW.width / 2, VIEW.height / 2, 640);
      vig.addColorStop(0, 'rgba(255,0,0,0)');
      vig.addColorStop(1, `rgba(200,20,20,${pulse})`);
      context.fillStyle = vig;
      context.fillRect(0, 0, VIEW.width, VIEW.height);
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, toWorld, context };
}
