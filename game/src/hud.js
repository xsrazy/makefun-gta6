// The HUD and the menus: the minimap, wanted stars, cash, health, the mission tracker,
// the dialogue box, the title screen, the pause menu and the wasted/busted screens.
// Everything here draws in the logical 1280x720 screen space, on top of the world.

import { GAME_NAME, GAME_TAGLINE, PALETTE, ROADS, SHORE, VIEW, WORLD } from './config.js';
import { districtAt } from './city.js';
import { trackerLabel } from './missions.js';

const MAP = { x: 20, y: VIEW.height - 178, w: 212, h: 158 };

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function starPath(ctx, cx, cy, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const radius = i % 2 === 0 ? r : r * 0.45;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function createHud() {
  const fonts = new Map();
  let buttons = [];
  let lastDistrict = '';
  let districtTimer = 0;

  function font(size, weight = 400) {
    const key = `${weight}/${size}`;
    if (!fonts.has(key)) fonts.set(key, `${weight} ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`);
    return fonts.get(key);
  }

  function text(ctx, value, x, y, size, color, align = 'left', weight = 400) {
    ctx.font = font(size, weight);
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(value, x, y);
  }

  function panel(ctx, x, y, w, h, radius = 10) {
    ctx.fillStyle = PALETTE.panel;
    roundRectPath(ctx, x, y, w, h, radius);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function drawMinimap(ctx, state, objective) {
    const sx = MAP.w / WORLD.width;
    const sy = MAP.h / WORLD.height;
    panel(ctx, MAP.x - 4, MAP.y - 4, MAP.w + 8, MAP.h + 8, 12);
    ctx.save();
    roundRectPath(ctx, MAP.x, MAP.y, MAP.w, MAP.h, 8);
    ctx.clip();
    ctx.fillStyle = '#6da352';
    ctx.fillRect(MAP.x, MAP.y, MAP.w, MAP.h);
    ctx.fillStyle = '#ecd9a0';
    ctx.fillRect(MAP.x, MAP.y + SHORE.sandTop * sy, MAP.w, (SHORE.waterTop - SHORE.sandTop) * sy);
    ctx.fillStyle = '#2e7fa8';
    ctx.fillRect(MAP.x, MAP.y + SHORE.waterTop * sy, MAP.w, MAP.h - SHORE.waterTop * sy);
    ctx.strokeStyle = '#c9c2b4';
    ctx.lineWidth = 5;
    for (const cx of ROADS.vertical) {
      ctx.beginPath();
      ctx.moveTo(MAP.x + cx * sx, MAP.y);
      ctx.lineTo(MAP.x + cx * sx, MAP.y + MAP.h);
      ctx.stroke();
    }
    for (const cy of ROADS.horizontal) {
      ctx.beginPath();
      ctx.moveTo(MAP.x, MAP.y + cy * sy);
      ctx.lineTo(MAP.x + MAP.w, MAP.y + cy * sy);
      ctx.stroke();
    }
    ctx.strokeStyle = '#3a3f46';
    ctx.lineWidth = 2.5;
    for (const cx of ROADS.vertical) {
      ctx.beginPath();
      ctx.moveTo(MAP.x + cx * sx, MAP.y);
      ctx.lineTo(MAP.x + cx * sx, MAP.y + MAP.h);
      ctx.stroke();
    }
    for (const cy of ROADS.horizontal) {
      ctx.beginPath();
      ctx.moveTo(MAP.x, MAP.y + cy * sy);
      ctx.lineTo(MAP.x + MAP.w, MAP.y + cy * sy);
      ctx.stroke();
    }
    // Safehouse.
    ctx.fillStyle = '#7ee787';
    ctx.fillRect(MAP.x + 650 * sx - 3, MAP.y + 620 * sy - 3, 6, 6);
    // Police blips, flashing red/blue.
    const flash = Math.floor(state.time * 3) % 2 === 0;
    for (const car of state.cars) {
      if (car.driver !== 'police' || car.dead) continue;
      ctx.fillStyle = flash ? '#ff5a4d' : '#4da3ff';
      ctx.beginPath();
      ctx.arc(MAP.x + car.x * sx, MAP.y + car.y * sy, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    // Enemies, red.
    for (const e of state.enemies) {
      ctx.fillStyle = '#ff2e2e';
      ctx.beginPath();
      ctx.arc(MAP.x + e.x * sx, MAP.y + e.y * sy, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Mission objective, pulsing gold.
    if (objective) {
      const r = 5 + Math.sin(state.time * 5) * 1.5;
      ctx.fillStyle = '#ffd60a';
      ctx.beginPath();
      ctx.arc(MAP.x + objective.x * sx, MAP.y + objective.y * sy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    // The player: a white arrow that turns with them.
    const p = state.player;
    ctx.save();
    ctx.translate(MAP.x + p.x * sx, MAP.y + p.y * sy);
    ctx.rotate(p.angle);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(8, 0);
    ctx.lineTo(-5, -5.5);
    ctx.lineTo(-5, 5.5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
    ctx.restore();
    text(ctx, 'N', MAP.x + MAP.w - 8, MAP.y + 14, 12, '#ffffff', 'right', 700);
    const district = districtAt(p.x, p.y);
    text(ctx, district.name.toUpperCase(), MAP.x + 2, MAP.y - 10, 13, PALETTE.text, 'left', 700);
  }

  function drawWantedAndMoney(ctx, state) {
    const p = state.player;
    // Wanted stars.
    for (let i = 0; i < 5; i += 1) {
      const x = VIEW.width - 24 - i * 30;
      const y = 34;
      starPath(ctx, x, y, 12);
      ctx.fillStyle = i < state.wanted ? PALETTE.star : PALETTE.starEmpty;
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    // Cash.
    text(ctx, `$${p.money.toLocaleString('en-US')}`, VIEW.width - 24, 74, 30, PALETTE.cash, 'right', 700);
    // Health bar.
    const hw = 190;
    const hx = VIEW.width - 24 - hw;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    roundRectPath(ctx, hx, 86, hw, 14, 7);
    ctx.fill();
    ctx.fillStyle = p.health < 35 ? PALETTE.healthLow : PALETTE.health;
    roundRectPath(ctx, hx, 86, hw * Math.max(0, p.health / 100), 14, 7);
    ctx.fill();
    text(ctx, 'HEALTH', hx, 80, 11, PALETTE.muted, 'left', 700);
    if (!p.car) {
      text(ctx, `PISTOL  ${p.ammo}`, VIEW.width - 24, 128, 17, PALETTE.text, 'right', 600);
    }
  }

  function drawMissionTracker(ctx, state) {
    const tracker = trackerLabel(state.mission);
    const x = 20;
    let y = 20;
    if (tracker) {
      const lines = wrapText(ctx, tracker.label, 300);
      const h = 34 + lines.length * 20;
      panel(ctx, x, y, 340, h);
      text(ctx, tracker.title.toUpperCase(), x + 14, y + 22, 14, PALETTE.mission, 'left', 800);
      ctx.font = font(16, 500);
      ctx.fillStyle = PALETTE.text;
      ctx.textAlign = 'left';
      for (let i = 0; i < lines.length; i += 1) ctx.fillText(lines[i], x + 14, y + 46 + i * 20);
      y += h + 8;
    } else if (state.storyDone) {
      panel(ctx, x, y, 340, 44);
      text(ctx, 'FREE ROAM', x + 14, y + 27, 15, PALETTE.mission, 'left', 800);
      y += 52;
    }
    // Message feed under the tracker.
    let my = y;
    for (const m of state.messages) {
      ctx.globalAlpha = Math.min(1, m.timer);
      panel(ctx, x, my, 340, 30);
      text(ctx, m.text, x + 14, my + 20, 14, PALETTE.text, 'left', 500);
      ctx.globalAlpha = 1;
      my += 36;
    }
  }

  function drawSpeedAndHints(ctx, state, hint) {
    const p = state.player;
    if (p.car) {
      const kmh = Math.round(Math.abs(p.car.speed) * 0.32);
      text(ctx, `${kmh}`, VIEW.width - 24, VIEW.height - 30, 44, PALETTE.text, 'right', 800);
      text(ctx, 'km/h', VIEW.width - 24, VIEW.height - 8, 13, PALETTE.muted, 'right', 600);
      text(ctx, p.car.type.name, VIEW.width - 24, VIEW.height - 100, 15, PALETTE.muted, 'right', 600);
      const cw = 150;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      roundRectPath(ctx, VIEW.width - 24 - cw, VIEW.height - 78, cw, 10, 5);
      ctx.fill();
      ctx.fillStyle = p.car.health < 30 ? PALETTE.healthLow : '#e8e8e8';
      roundRectPath(ctx, VIEW.width - 24 - cw, VIEW.height - 78, cw * Math.max(0, p.car.health / p.car.maxHealth), 10, 5);
      ctx.fill();
    }
    if (hint) {
      const w = ctx.measureText(hint).width + 32;
      panel(ctx, (VIEW.width - w) / 2, VIEW.height - 64, w, 34);
      text(ctx, hint, VIEW.width / 2, VIEW.height - 41, 16, PALETTE.text, 'center', 600);
    }
  }

  function drawDialog(ctx, state) {
    if (!state.dialog) return;
    const w = 660;
    const h = 78;
    const x = (VIEW.width - w) / 2;
    const y = VIEW.height - 170;
    panel(ctx, x, y, w, h, 12);
    ctx.fillStyle = PALETTE.accent;
    ctx.fillRect(x, y + 10, 5, h - 20);
    ctx.font = font(17, 500);
    const lines = wrapText(ctx, state.dialog, w - 40);
    ctx.fillStyle = PALETTE.text;
    ctx.textAlign = 'left';
    for (let i = 0; i < lines.length; i += 1) ctx.fillText(lines[i], x + 22, y + 32 + i * 22);
  }

  function drawBanner(ctx, state) {
    const banner = state.mission.banner;
    if (!banner) return;
    const alpha = Math.min(1, banner.timer);
    ctx.globalAlpha = alpha;
    const color = banner.kind === 'passed' ? PALETTE.mission : banner.kind === 'failed' ? PALETTE.danger : PALETTE.text;
    text(ctx, banner.text, VIEW.width / 2, 210, 54, color, 'center', 800);
    if (banner.sub) text(ctx, banner.sub, VIEW.width / 2, 244, 20, PALETTE.text, 'center', 500);
    ctx.globalAlpha = 1;
  }

  function drawObjectiveArrow(ctx, state, objective) {
    if (!objective) return;
    const p = state.player;
    const screenPos = {
      x: VIEW.width / 2 + (objective.x - state.camera.x) * 1.1,
      y: VIEW.height / 2 + (objective.y - state.camera.y) * 1.1,
    };
    if (screenPos.x > 40 && screenPos.x < VIEW.width - 40 && screenPos.y > 40 && screenPos.y < VIEW.height - 40) return;
    // Off-screen: pin the arrow to the edge of the screen, in the objective's direction.
    const angle = Math.atan2(objective.y - p.y, objective.x - p.x);
    const cx = VIEW.width / 2;
    const cy = VIEW.height / 2;
    const margin = 46;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const tx = dx !== 0 ? (VIEW.width / 2 - margin) / Math.abs(dx) : Infinity;
    const ty = dy !== 0 ? (VIEW.height / 2 - margin) / Math.abs(dy) : Infinity;
    const t = Math.min(tx, ty);
    let ax = cx + dx * t;
    let ay = cy + dy * t;
    let labelDy = 26;
    // Never sit on the minimap: hop just above it when the edge point lands there,
    // and put the distance above the arrow instead of under it.
    if (ax < MAP.x + MAP.w + 30 && ay > MAP.y - 20) {
      ay = MAP.y - 34;
      labelDy = -14;
    }
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(angle);
    ctx.fillStyle = PALETTE.mission;
    ctx.beginPath();
    ctx.moveTo(16, 0);
    ctx.lineTo(-8, -10);
    ctx.lineTo(-8, 10);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    const dist = Math.round(Math.hypot(objective.x - p.x, objective.y - p.y) / 10) * 10;
    text(ctx, `${dist}m`, ax, ay + labelDy, 13, PALETTE.mission, 'center', 700);
  }

  function drawCrosshair(ctx, mouse) {
    const { x, y } = mouse;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 15, y);
    ctx.lineTo(x - 6, y);
    ctx.moveTo(x + 6, y);
    ctx.lineTo(x + 15, y);
    ctx.moveTo(x, y - 15);
    ctx.lineTo(x, y - 6);
    ctx.moveTo(x, y + 6);
    ctx.lineTo(x, y + 15);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawButton(ctx, id, label, x, y, w, h, mouse, primary) {
    const hover = mouse.x >= x && mouse.x <= x + w && mouse.y >= y && mouse.y <= y + h;
    ctx.fillStyle = primary ? (hover ? '#ffb347' : '#f59e2c') : hover ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.07)';
    roundRectPath(ctx, x, y, w, h, 8);
    ctx.fill();
    ctx.strokeStyle = primary ? '#ffb347' : 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.stroke();
    text(ctx, label, x + w / 2, y + h / 2 + 7, 19, primary ? '#1a1206' : PALETTE.text, 'center', 700);
    buttons.push({ id, x, y, w, h });
  }

  function drawControlsList(ctx, x, y, title) {
    text(ctx, title, x, y, 15, PALETTE.mission, 'left', 800);
    const rows = [
      ['W A S D / Arrows', 'Walk, drive, steer'],
      ['Shift', 'Run'],
      ['E', 'Enter / exit car'],
      ['Mouse', 'Aim (on foot)'],
      ['Click', 'Shoot'],
      ['F', 'Punch'],
      ['Space', 'Handbrake'],
      ['P / Esc', 'Pause'],
      ['M', 'Mute sound'],
    ];
    rows.forEach(([key, desc], i) => {
      text(ctx, key, x, y + 26 + i * 22, 14, PALETTE.text, 'left', 700);
      text(ctx, desc, x + 170, y + 26 + i * 22, 14, PALETTE.muted, 'left', 400);
    });
  }

  return {
    buttons() {
      return buttons;
    },
    /** The in-game HUD: minimap, stars, money, tracker, speed, hints, dialog, banner. */
    drawHud(ctx, state, ui) {
      buttons = [];
      drawMinimap(ctx, state, ui.objective);
      drawWantedAndMoney(ctx, state);
      drawMissionTracker(ctx, state);
      drawSpeedAndHints(ctx, state, ui.hint);
      drawObjectiveArrow(ctx, state, ui.objective);
      drawDialog(ctx, state);
      drawBanner(ctx, state);
      if (!state.player.car) drawCrosshair(ctx, ui.mouse);
      // District arrival card, bottom-right above the speedometer.
      const district = districtAt(state.player.x, state.player.y);
      if (district.name !== lastDistrict) {
        lastDistrict = district.name;
        districtTimer = 3;
      }
      if (districtTimer > 0) {
        districtTimer -= ui.dt;
        ctx.globalAlpha = Math.min(1, districtTimer);
        text(ctx, district.name, VIEW.width - 24, VIEW.height - 132, 30, PALETTE.text, 'right', 800);
        ctx.globalAlpha = 1;
      }
    },
    /** The title screen over the living city. */
    drawTitle(ctx, state, ui) {
      buttons = [];
      const grad = ctx.createLinearGradient(0, 0, 0, VIEW.height);
      grad.addColorStop(0, 'rgba(8,12,18,0.55)');
      grad.addColorStop(0.55, 'rgba(8,12,18,0.35)');
      grad.addColorStop(1, 'rgba(8,12,18,0.78)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, VIEW.width, VIEW.height);
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = 18;
      text(ctx, GAME_NAME, 80, 210, 96, '#ffffff', 'left', 900);
      ctx.restore();
      text(ctx, GAME_TAGLINE, 80, 252, 24, PALETTE.accent, 'left', 600);
      text(ctx, 'Danny Cole is back in town — and Solmar Bay never forgets a wheelman.', 80, 288, 18, PALETTE.muted, 'left', 400);
      const bx = 80;
      let by = 330;
      drawButton(ctx, 'new', 'NEW GAME', bx, by, 260, 52, ui.mouse, true);
      by += 66;
      if (ui.hasSave) {
        drawButton(ctx, 'continue', 'CONTINUE', bx, by, 260, 52, ui.mouse, false);
        by += 66;
      }
      drawButton(ctx, 'controls', ui.showControls ? 'HIDE CONTROLS' : 'HOW TO PLAY', bx, by, 260, 52, ui.mouse, false);
      if (ui.showControls) drawControlsList(ctx, 420, 330, 'CONTROLS');
      else {
        text(ctx, 'An open-world crime story in a sun-soaked coastal city.', 420, 360, 17, PALETTE.text, 'left', 500);
        text(ctx, 'Steal cars. Outrun the SBPD. Run six missions for Marina Solano', 420, 388, 17, PALETTE.text, 'left', 500);
        text(ctx, 'and take down Kane Voss and the Vultures — or just cruise the coast.', 420, 416, 17, PALETTE.text, 'left', 500);
        text(ctx, '6 missions  ·  7 cars  ·  wanted levels  ·  8 hidden packages', 420, 470, 15, PALETTE.muted, 'left', 600);
      }
      text(ctx, 'Keyboard + mouse  ·  Progress saves automatically after each mission', 80, VIEW.height - 28, 14, PALETTE.muted, 'left', 400);
      text(ctx, 'An original game — no part of any commercial game is used.', 80, VIEW.height - 8, 12, 'rgba(255,255,255,0.35)', 'left', 400);
    },
    /** The pause menu: stats and buttons. */
    drawPause(ctx, state, ui) {
      buttons = [];
      ctx.fillStyle = 'rgba(8,12,18,0.72)';
      ctx.fillRect(0, 0, VIEW.width, VIEW.height);
      panel(ctx, 340, 90, 600, 540, 16);
      text(ctx, 'PAUSED', 640, 150, 40, PALETTE.text, 'center', 800);
      const found = state.packages.filter((p) => p.found).length;
      const stats = [
        ['Cash', `$${state.player.money.toLocaleString('en-US')}`],
        ['Missions complete', `${state.missionsDone.length} / 6`],
        ['Hidden packages', `${found} / 8`],
        ['Vultures taken down', `${state.kills}`],
        ['Cars stolen', `${state.carsStolen}`],
      ];
      stats.forEach(([label, value], i) => {
        text(ctx, label, 400, 200 + i * 30, 17, PALETTE.muted, 'left', 500);
        text(ctx, value, 880, 200 + i * 30, 17, PALETTE.text, 'right', 700);
      });
      let by = 380;
      drawButton(ctx, 'resume', 'RESUME  (Esc)', 430, by, 420, 48, ui.mouse, true);
      by += 60;
      drawButton(ctx, 'save', ui.saveMessage || 'SAVE GAME  (S)', 430, by, 420, 48, ui.mouse, false);
      by += 60;
      drawButton(ctx, 'restart', 'RESTART MISSION  (R)', 430, by, 420, 48, ui.mouse, false);
      by += 60;
      drawButton(ctx, 'quit', 'QUIT TO TITLE  (Q)', 430, by, 420, 48, ui.mouse, false);
    },
    /** The wasted / busted end screens. */
    drawEnd(ctx, kind) {
      buttons = [];
      ctx.fillStyle = kind === 'wasted' ? 'rgba(60,8,8,0.55)' : 'rgba(8,16,60,0.55)';
      ctx.fillRect(0, 0, VIEW.width, VIEW.height);
      text(ctx, kind === 'wasted' ? 'WASTED' : 'BUSTED', VIEW.width / 2, 330, 92, '#ffffff', 'center', 900);
      text(
        ctx,
        kind === 'wasted' ? 'Bay General Hospital patched you up — minus 10% for the bill.' : 'The SBPD took their cut — minus 10% in fines.',
        VIEW.width / 2, 380, 19, PALETTE.muted, 'center', 500,
      );
      text(ctx, 'Press Enter to get back on the streets', VIEW.width / 2, 440, 20, PALETTE.accent, 'center', 600);
    },
  };
}
